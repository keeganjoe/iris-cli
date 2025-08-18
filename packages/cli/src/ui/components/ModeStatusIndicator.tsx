/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Config } from 'iris-cli-core';

interface ModeStatusIndicatorProps {
  config: Config | null;
}

export const ModeStatusIndicator: React.FC<ModeStatusIndicatorProps> = ({ config }) => {
  if (!config) {
    return null;
  }

  const reActEnabled = config.getReActEnabled();
  const plannerEnabled = config.getPlannerEnabled();

  // Only show if either mode is enabled
  if (!reActEnabled && !plannerEnabled) {
    return null;
  }

  const modes = [];
  if (reActEnabled) {
    modes.push(<Text key="react" color="blue">🧠 ReAct</Text>);
  }
  if (plannerEnabled) {
    modes.push(<Text key="planner" color="green">📋 Planning</Text>);
  }

  return (
    <Box paddingX={1}>
      <Text color="gray">[</Text>
      {modes.map((mode, index) => (
        <React.Fragment key={index}>
          {mode}
          {index < modes.length - 1 && <Text color="gray"> | </Text>}
        </React.Fragment>
      ))}
      <Text color="gray">]</Text>
    </Box>
  );
};