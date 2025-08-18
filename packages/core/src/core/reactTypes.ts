/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolCallRequestInfo } from './turn.js';

/**
 * Represents a single ReAct cycle with thought, action, observation, and reflection.
 */
export interface ReActCycle {
  id: string;
  thought: string;
  action: ToolCallRequestInfo | null;
  observation: string;
  reflection: string;
  timestamp: Date;
  confidence: number;
  status: 'thinking' | 'acting' | 'observing' | 'reflecting' | 'completed' | 'failed';
  duration?: number;
}

/**
 * Configuration options for ReAct processing.
 */
export interface ReActConfig {
  maxCycles: number;
  thinkingTimeout: number;
  showInternalThoughts: boolean;
  autoReflection: boolean;
  confidenceThreshold: number;
  enableParallelActions: boolean;
}

/**
 * Context for ReAct processing including goal and environment.
 */
export interface ReActContext {
  goal: string;
  initialContext: Record<string, any>;
  constraints: string[];
  availableTools: string[];
  maxDuration?: number;
}

/**
 * Result of a completed ReAct session.
 */
export interface ReActResult {
  sessionId: string;
  cycles: ReActCycle[];
  finalThought: string;
  success: boolean;
  totalDuration: number;
  cycleCount: number;
  averageConfidence: number;
  finalResult?: any;
}

/**
 * Options for thought generation.
 */
export interface ThoughtOptions {
  includeContext: boolean;
  maxLength: number;
  temperature: number;
}

/**
 * Options for reflection generation.
 */
export interface ReflectionOptions {
  includeHistory: boolean;
  focusOnLearning: boolean;
  maxLength: number;
}

/**
 * Interface for the ReAct processor service.
 */
export interface IReActProcessor {
  startSession(context: ReActContext, config: ReActConfig): Promise<ReActResult>;
  think(context: any, options?: ThoughtOptions): Promise<string>;
  act(thought: string, availableTools: string[]): Promise<ToolCallRequestInfo | null>;
  observe(actionResult: any): Promise<string>;
  reflect(cycle: ReActCycle, history?: ReActCycle[], options?: ReflectionOptions): Promise<string>;
  shouldContinue(cycles: ReActCycle[], context: ReActContext): boolean;
  calculateConfidence(cycle: ReActCycle): number;
}

/**
 * Events emitted during ReAct processing.
 */
export enum ReActEventType {
  CycleStarted = 'cycle_started',
  ThoughtGenerated = 'thought_generated',
  ActionPlanned = 'action_planned',
  ActionExecuted = 'action_executed',
  ObservationMade = 'observation_made',
  ReflectionGenerated = 'reflection_generated',
  CycleCompleted = 'cycle_completed',
  SessionCompleted = 'session_completed',
  SessionFailed = 'session_failed',
}

/**
 * Base interface for ReAct events.
 */
export interface ReActEvent {
  type: ReActEventType;
  sessionId: string;
  cycleId?: string;
  timestamp: Date;
  data: any;
}

/**
 * Event listener for ReAct events.
 */
export type ReActEventListener = (event: ReActEvent) => void;

/**
 * ReAct session statistics.
 */
export interface ReActStats {
  totalSessions: number;
  successfulSessions: number;
  averageCycles: number;
  averageDuration: number;
  toolUsageStats: Record<string, number>;
  commonFailureReasons: string[];
}