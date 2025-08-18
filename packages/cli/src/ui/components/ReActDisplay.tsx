/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { ReActCycleDisplay, HistoryItemReAct } from '../types.js';

interface ReActDisplayProps {
  reActItem: HistoryItemReAct;
}

interface CycleDisplayProps {
  cycle: ReActCycleDisplay;
  isCurrentCycle?: boolean;
}

const CycleDisplay: React.FC<CycleDisplayProps> = ({ cycle, isCurrentCycle = false }) => {
  const getStatusIcon = (status: ReActCycleDisplay['status']) => {
    switch (status) {
      case 'thinking': return '🤔';
      case 'acting': return '🛠️';
      case 'observing': return '👁️';
      case 'reflecting': return '🔄';
      case 'completed': return '✅';
      case 'failed': return '❌';
      default: return '⏳';
    }
  };

  const getStatusColor = (status: ReActCycleDisplay['status']) => {
    switch (status) {
      case 'thinking': return 'blue';
      case 'acting': return 'yellow';
      case 'observing': return 'green';
      case 'reflecting': return 'cyan';
      case 'completed': return 'green';
      case 'failed': return 'red';
      default: return 'white';
    }
  };

  return (
    <Box flexDirection="column" marginBottom={1} paddingLeft={2}>
      <Box marginBottom={1}>
        <Text color={getStatusColor(cycle.status)} bold={isCurrentCycle}>
          {getStatusIcon(cycle.status)} Cycle {cycle.cycleIndex + 1} 
          {isCurrentCycle && ' (Active)'}
          {cycle.duration && ` (${cycle.duration}ms)`}
          {cycle.confidence && ` - Confidence: ${Math.round(cycle.confidence * 100)}%`}
        </Text>
      </Box>

      {cycle.thought && (
        <Box marginBottom={1} paddingLeft={2}>
          <Box flexDirection="column">
            <Text color="blue" bold>💭 Thought:</Text>
            <Text color="white">{cycle.thought}</Text>
          </Box>
        </Box>
      )}

      {cycle.action && (
        <Box marginBottom={1} paddingLeft={2}>
          <Box flexDirection="column">
            <Text color="yellow" bold>🛠️ Action:</Text>
            <Text color="white">
              {cycle.action.name}({JSON.stringify(cycle.action.args)})
            </Text>
            {cycle.action.reasoning && (
              <Text color="gray" italic>
                Reasoning: {cycle.action.reasoning}
              </Text>
            )}
          </Box>
        </Box>
      )}

      {cycle.observation && (
        <Box marginBottom={1} paddingLeft={2}>
          <Box flexDirection="column">
            <Text color="green" bold>👁️ Observation:</Text>
            <Text color="white">{cycle.observation}</Text>
          </Box>
        </Box>
      )}

      {cycle.reflection && (
        <Box marginBottom={1} paddingLeft={2}>
          <Box flexDirection="column">
            <Text color="cyan" bold>🔄 Reflection:</Text>
            <Text color="white">{cycle.reflection}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};

const ReActDisplay: React.FC<ReActDisplayProps> = ({ reActItem }) => {
  const getSessionStatusIcon = (status: HistoryItemReAct['status']) => {
    switch (status) {
      case 'active': return '🔄';
      case 'completed': return '✅';
      case 'failed': return '❌';
      default: return '⏳';
    }
  };

  const getSessionStatusColor = (status: HistoryItemReAct['status']) => {
    switch (status) {
      case 'active': return 'blue';
      case 'completed': return 'green';
      case 'failed': return 'red';
      default: return 'white';
    }
  };

  return (
    <Box flexDirection="column" marginBottom={2} borderStyle="round" borderColor="blue" paddingX={2} paddingY={1}>
      {/* Session Header */}
      <Box marginBottom={2}>
        <Text color={getSessionStatusColor(reActItem.status)} bold>
          {getSessionStatusIcon(reActItem.status)} ReAct Session: {reActItem.goal}
        </Text>
      </Box>

      {/* Session Info */}
      <Box flexDirection="row" marginBottom={2}>
        <Box marginRight={2}>
          <Text color="gray">Status: </Text>
          <Text color={getSessionStatusColor(reActItem.status)}>{reActItem.status}</Text>
        </Box>
        <Box marginRight={2}>
          <Text color="gray">Cycles: </Text>
          <Text color="white">{reActItem.cycles.length}</Text>
        </Box>
        {reActItem.totalDuration && (
          <Box>
            <Text color="gray">Duration: </Text>
            <Text color="white">{reActItem.totalDuration}ms</Text>
          </Box>
        )}
      </Box>

      {/* Current Cycle (if active) */}
      {reActItem.currentCycle && reActItem.status === 'active' && (
        <Box marginBottom={2}>
          <Text color="blue" bold>Current Cycle:</Text>
          <CycleDisplay cycle={reActItem.currentCycle} isCurrentCycle={true} />
        </Box>
      )}

      {/* Completed Cycles */}
      {reActItem.cycles.length > 0 && (
        <Box flexDirection="column">
          <Text color="white" bold>Cycle History:</Text>
          {reActItem.cycles.map((cycle) => (
            <CycleDisplay key={cycle.id} cycle={cycle} />
          ))}
        </Box>
      )}

      {/* Final Result */}
      {reActItem.finalResult && reActItem.status === 'completed' && (
        <Box marginTop={2} paddingTop={1} borderTop borderTopColor="green">
          <Box flexDirection="column">
            <Text color="green" bold>✅ Final Result:</Text>
            <Text color="white">{reActItem.finalResult}</Text>
          </Box>
        </Box>
      )}

      {/* Session ID (for debugging) */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Session ID: {reActItem.sessionId}
        </Text>
      </Box>
    </Box>
  );
};

export default ReActDisplay;