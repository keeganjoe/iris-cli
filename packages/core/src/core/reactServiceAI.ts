/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AIClient, AIStreamEvent, SupportedProvider } from './aiClient.js';
import {
  ReActConfig,
  ReActContext,
  ReActResult,
  ReActEventListener,
  ReActCycle,
  ReActEvent,
  ReActEventType,
} from './reactTypes.js';
import { Config } from '../config/config.js';
import { AuthType } from './contentGenerator.js';
import { z } from 'zod';
import { 
  REACT_PLANNING_SYSTEM_PROMPT,
  REACT_THINKING_SYSTEM_PROMPT,
  REACT_ACTION_SYSTEM_PROMPT,
  REACT_REFLECTION_SYSTEM_PROMPT,
  buildReActContext
} from './reactPrompts.js';

/**
 * ReAct service that uses the AI SDK for unified multi-provider support.
 * This replaces the Gemini-specific ReAct implementation.
 */
export class ReActServiceAI {
  private aiClient: AIClient;
  private config: Config;
  private activeSession: ReActResult | null = null;
  private eventListeners: ReActEventListener[] = [];

  constructor(config: Config) {
    this.config = config;
    this.aiClient = this.createAIClient();
  }

  private createAIClient(): AIClient {
    const model = this.config.getModel();
    const contentGeneratorConfig = this.config.getContentGeneratorConfig();
    
    // Determine provider from config
    let provider: SupportedProvider = 'openai'; // Default
    let apiKey = '';
    let baseURL: string | undefined;

    // Map AuthType to SupportedProvider
    switch (contentGeneratorConfig?.authType) {
      case AuthType.USE_OPENAI:
        provider = 'openai';
        apiKey = process.env.OPENAI_API_KEY || contentGeneratorConfig.apiKey || '';
        break;
      case AuthType.USE_ANTHROPIC:
        provider = 'anthropic';
        apiKey = process.env.ANTHROPIC_API_KEY || contentGeneratorConfig.apiKey || '';
        break;
      case AuthType.USE_OPENROUTER:
        provider = 'openrouter';
        apiKey = process.env.OPENROUTER_API_KEY || contentGeneratorConfig.apiKey || '';
        baseURL = contentGeneratorConfig.baseURL || 'https://openrouter.ai/api/v1';
        break;
      case AuthType.USE_LITELLM:
        provider = 'litellm';
        apiKey = process.env.LITELLM_API_KEY || contentGeneratorConfig.apiKey || '';
        baseURL = contentGeneratorConfig.baseURL || 'http://localhost:4000';
        break;
      default:
        // Fallback to OpenAI for non-legacy modes
        provider = 'openai';
        apiKey = process.env.OPENAI_API_KEY || '';
    }

    return new AIClient(this.config, {
      provider,
      model,
      apiKey,
      baseURL,
    });
  }

  /**
   * Initialize the ReAct service.
   */
  async initialize(): Promise<void> {
    await this.aiClient.initialize();
  }

  /**
   * Process a query using ReAct methodology with AI SDK.
   */
  async processQuery(
    query: string,
    isReActMode: boolean = false,
  ): Promise<{
    shouldProceedWithNormalFlow: boolean;
    reActResult?: ReActResult;
    processedQuery?: string;
  }> {
    // Check if ReAct mode is enabled in config
    if (!this.config.getReActEnabled?.()) {
      return { shouldProceedWithNormalFlow: true, processedQuery: query };
    }

    // Auto-detect ReAct mode for complex queries
    if (!isReActMode) {
      const simplePatterns = ['/help', '/quit', '/clear', 'yes', 'no', 'y', 'n'];
      const isSimpleQuery = simplePatterns.some(pattern => 
        query.toLowerCase().trim() === pattern.toLowerCase()
      ) || query.trim().length < 3;

      isReActMode = !isSimpleQuery;
      
      // Debug logging to see what's happening
      console.log(`[ReAct Debug] Query: "${query.substring(0, 50)}..."`);
      console.log(`[ReAct Debug] isSimpleQuery: ${isSimpleQuery}, isReActMode: ${isReActMode}`);
      console.log(`[ReAct Debug] ReAct enabled: ${this.config.getReActEnabled?.()}`);
    }

    if (!isReActMode) {
      return { shouldProceedWithNormalFlow: true, processedQuery: query };
    }

    // Extract goal from command
    let goal = query;
    if (query.toLowerCase().startsWith('/react ')) {
      goal = query.slice(7).trim();
    }

    try {
      const reActResult = await this.startReActSession(goal);
      const summary = await this.generateReActSummary(reActResult, goal);
      
      return { 
        shouldProceedWithNormalFlow: true,
        reActResult,
        processedQuery: summary,
      };
    } catch (error) {
      console.error('Failed to start ReAct session:', error);
      return { 
        shouldProceedWithNormalFlow: true, 
        processedQuery: `I encountered an error starting ReAct mode: ${error instanceof Error ? error.message : String(error)}. Proceeding with normal mode: ${goal}`,
      };
    }
  }

  /**
   * Start a new ReAct session using AI SDK.
   */
  async startReActSession(goal: string): Promise<ReActResult> {
    const sessionId = `react_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const startTime = Date.now();
    
    const result: ReActResult = {
      sessionId,
      cycles: [],
      finalThought: '',
      success: false,
      totalDuration: 0,
      cycleCount: 0,
      averageConfidence: 0,
    };

    this.activeSession = result;

    try {
      const reActSettings = this.config.getReActSettings?.() || { maxCycles: 5 };
      const maxCycles = reActSettings.maxCycles || 5;
      
      let totalConfidence = 0;
      let cycleCount = 0;

      for (let i = 0; i < maxCycles; i++) {
        const cycle = await this.executeCycle(sessionId, i, goal, result.cycles);
        result.cycles.push(cycle);
        totalConfidence += cycle.confidence;
        cycleCount++;

        // Check if we should stop
        if (cycle.confidence > 0.8 || !this.shouldContinue(result.cycles)) {
          break;
        }
      }

      result.success = cycleCount > 0 && result.cycles[result.cycles.length - 1].status === 'completed';
      result.totalDuration = Date.now() - startTime;
      result.cycleCount = cycleCount;
      result.averageConfidence = totalConfidence / cycleCount;
      result.finalThought = result.cycles[result.cycles.length - 1]?.thought || '';

      this.emitEvent({
        type: ReActEventType.SessionCompleted,
        sessionId,
        timestamp: new Date(),
        data: result,
      });

    } catch (error) {
      result.success = false;
      result.totalDuration = Date.now() - startTime;
      
      this.emitEvent({
        type: ReActEventType.SessionFailed,
        sessionId,
        timestamp: new Date(),
        data: { error: error instanceof Error ? error.message : String(error) },
      });
    } finally {
      this.activeSession = null;
    }

    return result;
  }

  /**
   * Execute a single ReAct cycle using AI SDK.
   */
  private async executeCycle(
    sessionId: string,
    cycleIndex: number,
    goal: string,
    previousCycles: ReActCycle[]
  ): Promise<ReActCycle> {
    const cycleId = `cycle_${cycleIndex}`;
    const cycleStartTime = Date.now();

    const cycle: ReActCycle = {
      id: cycleId,
      thought: '',
      action: null,
      observation: '',
      reflection: '',
      timestamp: new Date(),
      confidence: 0,
      status: 'thinking',
    };

    // Emit cycle started event
    this.emitEvent({
      type: ReActEventType.CycleStarted,
      sessionId,
      cycleId,
      timestamp: new Date(),
      data: { cycleIndex },
    });

    try {
      // Step 1: Generate thought using AI SDK
      cycle.status = 'thinking';
      cycle.thought = await this.generateThought(goal, previousCycles);
      
      this.emitEvent({
        type: ReActEventType.ThoughtGenerated,
        sessionId,
        cycleId,
        timestamp: new Date(),
        data: { thought: cycle.thought },
      });

      // Step 2: Plan action
      cycle.status = 'acting';
      const actionResult = await this.planAction(cycle.thought, goal);
      
      if (actionResult) {
        cycle.action = actionResult;
        this.emitEvent({
          type: ReActEventType.ActionPlanned,
          sessionId,
          cycleId,
          timestamp: new Date(),
          data: { action: cycle.action },
        });

        // Step 3: Execute action and observe
        cycle.status = 'observing';
        cycle.observation = await this.executeAndObserve(cycle.action);
      } else {
        cycle.observation = 'No action needed. Analysis completed through reasoning.';
      }

      this.emitEvent({
        type: ReActEventType.ObservationMade,
        sessionId,
        cycleId,
        timestamp: new Date(),
        data: { observation: cycle.observation },
      });

      // Step 4: Reflect
      cycle.status = 'reflecting';
      cycle.reflection = await this.generateReflection(cycle, previousCycles);
      
      this.emitEvent({
        type: ReActEventType.ReflectionGenerated,
        sessionId,
        cycleId,
        timestamp: new Date(),
        data: { reflection: cycle.reflection },
      });

      // Calculate confidence and finalize
      cycle.confidence = this.calculateConfidence(cycle);
      cycle.status = 'completed';
      cycle.duration = Date.now() - cycleStartTime;

    } catch (error) {
      cycle.status = 'failed';
      cycle.duration = Date.now() - cycleStartTime;
      cycle.observation = `Error during cycle: ${error instanceof Error ? error.message : String(error)}`;
      cycle.confidence = 0;
    }

    this.emitEvent({
      type: ReActEventType.CycleCompleted,
      sessionId,
      cycleId,
      timestamp: new Date(),
      data: cycle,
    });

    return cycle;
  }

  /**
   * Generate thought using AI SDK with enhanced prompting.
   */
  private async generateThought(goal: string, previousCycles: ReActCycle[]): Promise<string> {
    const context = buildReActContext(goal, previousCycles, 'thinking');
    
    try {
      const prompt = `Analyze this goal and think through the best approach to create a comprehensive implementation plan: "${goal}"

Consider:
- What are the key components and phases needed?
- What technologies and approaches should be evaluated?
- What specific information would be most valuable to include?
- How can this be structured for maximum practical value?

Provide your strategic thinking about how to approach this planning task.`;

      const result = await this.aiClient.generateText(prompt, {
        system: REACT_THINKING_SYSTEM_PROMPT,
        temperature: 0.7,
        maxTokens: 500,
      });
      
      return result.text.trim();
    } catch (error) {
      console.warn('AI thought generation failed, using fallback:', error);
      return this.generateFallbackThought(goal, previousCycles);
    }
  }

  /**
   * Plan action using AI SDK with structured output.
   */
  private async planAction(thought: string, goal: string): Promise<any> {
    const actionSchema = z.object({
      action: z.enum(['analyze', 'search', 'read_file', 'shell_command', 'none']),
      target: z.string().optional(),
      reasoning: z.string(),
    });

    try {
      const result = await this.aiClient.generateJSON(
        `Based on this thought: "${thought}", what action should I take to work towards: "${goal}"?`,
        actionSchema,
        {
          system: 'You are a ReAct agent deciding on the next action. Choose the most appropriate action or "none" if no action is needed.',
          temperature: 0.3,
        }
      );

      if (result.action === 'none') {
        return null;
      }

      return {
        name: result.action,
        args: { target: result.target, reasoning: result.reasoning },
      };
    } catch (error) {
      console.warn('AI action planning failed, using fallback:', error);
      return null;
    }
  }

  /**
   * Execute action and observe results.
   */
  private async executeAndObserve(action: any): Promise<string> {
    if (!action) {
      return 'No action taken.';
    }

    try {
      // This would integrate with the actual tool execution system
      // For now, simulate the observation
      return `Executed ${action.name} with reasoning: ${action.args?.reasoning || 'No reasoning provided'}`;
    } catch (error) {
      return `Failed to execute ${action.name}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Generate reflection using AI SDK.
   */
  private async generateReflection(cycle: ReActCycle, previousCycles: ReActCycle[]): Promise<string> {
    const context = this.buildReflectionContext(cycle, previousCycles);
    
    try {
      const result = await this.aiClient.generateText(
        'Reflect on what was learned in this cycle and what should happen next.',
        {
          system: context,
          temperature: 0.4,
          maxTokens: 150,
        }
      );
      
      return result.text.trim();
    } catch (error) {
      console.warn('AI reflection failed, using fallback:', error);
      return this.generateFallbackReflection(cycle);
    }
  }

  /**
   * Generate comprehensive summary from ReAct results using enhanced AI generation.
   */
  private async generateReActSummary(reActResult: ReActResult, originalGoal: string): Promise<string> {
    if (!reActResult.success || reActResult.cycles.length === 0) {
      return `Based on my step-by-step analysis of "${originalGoal}", I encountered some challenges but can provide insights based on the initial investigation.`;
    }

    // Gather all insights from the ReAct cycles
    const cycles = reActResult.cycles;
    const allThoughts = cycles.map(cycle => cycle.thought).filter(Boolean);
    const allObservations = cycles.map(cycle => cycle.observation).filter(Boolean);
    const allReflections = cycles.map(cycle => cycle.reflection).filter(Boolean);

    // Debug: Check what content we have from cycles
    console.log('[ReAct Debug] Cycles completed:', cycles.length);
    console.log('[ReAct Debug] Thoughts collected:', allThoughts.length);
    console.log('[ReAct Debug] Observations collected:', allObservations.length);
    console.log('[ReAct Debug] Reflections collected:', allReflections.length);
    console.log('[ReAct Debug] Sample thought:', allThoughts[0]?.substring(0, 100) + '...');
    console.log('[ReAct Debug] Sample observation:', allObservations[0]?.substring(0, 100) + '...');

    // Build comprehensive context for AI generation
    const contextPrompt = `
# ReAct Analysis Summary

## Original Goal
${originalGoal}

## Analysis Process
Completed ${cycles.length} reasoning cycles with ${Math.round(reActResult.averageConfidence * 100)}% average confidence.

## Key Insights from Reasoning Cycles
${allThoughts.map((thought, i) => `### Cycle ${i + 1} Thinking:\n${thought}`).join('\n\n')}

## Observations and Findings
${allObservations.map((obs, i) => `### Discovery ${i + 1}:\n${obs}`).join('\n\n')}

## Reflections and Learnings
${allReflections.map((ref, i) => `### Reflection ${i + 1}:\n${ref}`).join('\n\n')}

Generate a comprehensive, well-formatted implementation plan based on this analysis. Include:
- Executive summary with clear objectives
- Detailed phases with realistic timelines
- Technology recommendations with specific tools and frameworks
- Code examples and architectural guidance where relevant
- Cost estimates and resource requirements
- Risk analysis and mitigation strategies
- Next steps and actionable items

Format with rich markdown including headers, tables, code blocks, and strategic use of emojis for visual appeal.
`;

    try {
      console.log('[ReAct Debug] Starting AI summary generation...');
      console.log('[ReAct Debug] Context prompt length:', contextPrompt.length);
      
      // Generate comprehensive response using AI SDK
      const result = await this.aiClient.generateText(contextPrompt, {
        system: REACT_PLANNING_SYSTEM_PROMPT,
        temperature: 0.3, // Lower temperature for more focused output
        maxTokens: 2000, // Increased limit for comprehensive responses
      });

      console.log('[ReAct Debug] AI summary generation succeeded, length:', result.text.length);
      console.log('[ReAct Debug] Generated content preview:', result.text.substring(0, 200) + '...');

      // Add ReAct metadata footer
      const metadata = `

---
*🤖 Generated using ReAct (Reasoning and Acting) methodology with ${cycles.length} reasoning cycles and ${Math.round(reActResult.averageConfidence * 100)}% confidence*`;

      const finalResponse = result.text.trim() + metadata;
      console.log('[ReAct Debug] Final response length:', finalResponse.length);
      console.log('[ReAct Debug] Final response preview:', finalResponse.substring(0, 200) + '...');
      
      return finalResponse;

    } catch (error) {
      console.warn('[ReAct Debug] AI summary generation failed, using enhanced fallback:', error);
      
      // Enhanced fallback with better formatting
      const findings = allObservations.slice(0, 3);
      let summary = `## 🎯 ${originalGoal}\n\n`;
      summary += `*Analyzed using ${cycles.length} reasoning cycles*\n\n`;
      
      if (findings.length > 0) {
        summary += `### 📋 Key Discoveries:\n`;
        findings.forEach((finding, index) => {
          summary += `${index + 1}. ${finding}\n`;
        });
        summary += '\n';
      }

      const lastCycle = cycles[cycles.length - 1];
      if (lastCycle.reflection) {
        summary += `### 🔍 Analysis Summary:\n${lastCycle.reflection}\n\n`;
      }

      // Generate dynamic suggestions using existing method
      summary += await this.generateDynamicSuggestions(originalGoal, cycles, findings);
      
      if (reActResult.averageConfidence > 0.7) {
        summary += `\n✅ High confidence analysis (${Math.round(reActResult.averageConfidence * 100)}% confidence)`;
      } else {
        summary += `\n⚠️ Moderate confidence analysis (${Math.round(reActResult.averageConfidence * 100)}% confidence) - consider additional validation`;
      }

      return summary;
    }
  }

  /**
   * Generate dynamic suggestions using AI SDK.
   */
  private async generateDynamicSuggestions(
    originalGoal: string, 
    cycles: ReActCycle[], 
    findings: string[]
  ): Promise<string> {
    const prompt = `Based on the ReAct analysis results, provide specific, actionable suggestions and next steps.

**ORIGINAL GOAL:** ${originalGoal}
**ANALYSIS FINDINGS:** ${findings.map((finding, index) => `${index + 1}. ${finding}`).join('\n')}

Provide specific suggestions based only on what was discovered.`;

    try {
      const result = await this.aiClient.generateText(prompt, {
        system: 'You are an expert consultant providing actionable recommendations based on analysis results.',
        temperature: 0.4,
        maxTokens: 300,
      });
      
      return result.text;
    } catch (error) {
      console.warn('Dynamic suggestions generation failed:', error);
      return `## 💡 Suggestions:\n• Follow up on key findings from the analysis\n• Apply the insights gained from the step-by-step reasoning\n\n## 🚀 Next Steps:\n1. Use the analysis results to guide your next actions\n2. Monitor progress based on what was learned`;
    }
  }

  // Helper methods
  private buildThoughtContext(goal: string, previousCycles: ReActCycle[]): string {
    let context = `You are using ReAct (Reasoning and Acting) methodology to work towards: ${goal}\n\n`;
    
    if (previousCycles.length > 0) {
      context += 'Previous cycles:\n';
      previousCycles.slice(-2).forEach((cycle, index) => {
        context += `${index + 1}. Thought: "${cycle.thought}"\n`;
        context += `   Observation: "${cycle.observation}"\n`;
      });
    }
    
    return context;
  }

  private buildReflectionContext(cycle: ReActCycle, previousCycles: ReActCycle[]): string {
    return `Reflect on this ReAct cycle:
Thought: "${cycle.thought}"
Action: ${cycle.action ? cycle.action.name : 'None'}
Observation: "${cycle.observation}"

What was learned and what should happen next?`;
  }

  private generateFallbackThought(goal: string, previousCycles: ReActCycle[]): string {
    if (previousCycles.length === 0) {
      return `I need to systematically work towards: ${goal}. Let me start by understanding what needs to be done.`;
    }
    return `Continuing to work on: ${goal}. Let me build on what I've learned so far.`;
  }

  private generateFallbackReflection(cycle: ReActCycle): string {
    if (cycle.action) {
      return `I took action: ${cycle.action.name}. This provided useful information to continue the analysis.`;
    }
    return 'This thinking step helped clarify the approach. I should proceed with concrete actions.';
  }

  private shouldContinue(cycles: ReActCycle[]): boolean {
    if (cycles.length === 0) return true;
    
    const lastCycle = cycles[cycles.length - 1];
    if (lastCycle.status === 'failed') return false;
    if (lastCycle.confidence > 0.8) return false;
    
    return true;
  }

  private calculateConfidence(cycle: ReActCycle): number {
    let confidence = 0.5;
    
    if (cycle.observation.toLowerCase().includes('success')) confidence += 0.3;
    if (cycle.observation.toLowerCase().includes('complete')) confidence += 0.2;
    if (cycle.thought.length > 50) confidence += 0.1;
    if (cycle.action !== null) confidence += 0.1;
    
    if (cycle.observation.toLowerCase().includes('error')) confidence -= 0.3;
    if (cycle.observation.toLowerCase().includes('fail')) confidence -= 0.2;
    if (cycle.status === 'failed') confidence = 0.0;
    
    return Math.max(0, Math.min(1, confidence));
  }

  private emitEvent(event: ReActEvent): void {
    this.eventListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in ReAct event listener:', error);
      }
    });
  }

  // Public interface methods
  addEventListener(listener: ReActEventListener): void {
    this.eventListeners.push(listener);
  }

  removeEventListener(listener: ReActEventListener): void {
    const index = this.eventListeners.indexOf(listener);
    if (index > -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  isReActActive(): boolean {
    return this.activeSession !== null;
  }

  getCurrentSession(): ReActResult | null {
    return this.activeSession;
  }

  stopReActSession(): void {
    if (this.activeSession) {
      console.log('Manually stopping ReAct session:', this.activeSession.sessionId);
    }
    this.activeSession = null;
  }

  setEventEmitter(emitter: (event: any) => void): void {
    // Bridge to the streaming event system
    this.addEventListener((reActEvent) => {
      // Convert ReAct events to streaming events
      const streamEvent = this.convertToStreamEvent(reActEvent);
      if (streamEvent) {
        emitter(streamEvent);
      }
    });
  }

  private convertToStreamEvent(reActEvent: ReActEvent): any {
    // Convert ReAct event types to the expected streaming event format
    switch (reActEvent.type) {
      case ReActEventType.CycleStarted:
        return {
          type: 'ReActCycleStarted',
          value: {
            sessionId: reActEvent.sessionId,
            cycleId: reActEvent.cycleId,
            cycleIndex: (reActEvent.data as any).cycleIndex || 0,
            status: 'started',
          },
        };
      
      case ReActEventType.ThoughtGenerated:
        return {
          type: 'ReActThought',
          value: {
            sessionId: reActEvent.sessionId,
            cycleId: reActEvent.cycleId,
            thought: (reActEvent.data as any).thought,
            confidence: (reActEvent.data as any).confidence,
          },
        };
      
      case ReActEventType.ActionPlanned:
        return {
          type: 'ReActAction',
          value: {
            sessionId: reActEvent.sessionId,
            cycleId: reActEvent.cycleId,
            action: (reActEvent.data as any).action,
            reasoning: (reActEvent.data as any).reasoning || '',
          },
        };
      
      case ReActEventType.ObservationMade:
        return {
          type: 'ReActObservation',
          value: {
            sessionId: reActEvent.sessionId,
            cycleId: reActEvent.cycleId,
            observation: (reActEvent.data as any).observation,
            success: true,
          },
        };
      
      case ReActEventType.ReflectionGenerated:
        return {
          type: 'ReActReflection',
          value: {
            sessionId: reActEvent.sessionId,
            cycleId: reActEvent.cycleId,
            reflection: (reActEvent.data as any).reflection,
            lessons: (reActEvent.data as any).lessons || [],
          },
        };
      
      case ReActEventType.CycleCompleted:
        return {
          type: 'ReActCycleCompleted',
          value: {
            sessionId: reActEvent.sessionId,
            cycleId: reActEvent.cycleId,
            cycleIndex: (reActEvent.data as any).cycleIndex || 0,
            status: 'completed',
          },
        };
      
      default:
        return null;
    }
  }
}