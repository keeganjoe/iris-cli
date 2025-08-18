/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GitIgnoreParser, GitIgnoreFilter } from '../utils/gitIgnoreParser.js';
import { isGitRepository } from '../utils/gitUtils.js';
import * as path from 'path';

const IRIS_IGNORE_FILE_NAME = '.irisignore';

export interface FilterFilesOptions {
  respectGitIgnore?: boolean;
  respectIrisIgnore?: boolean;
}

export class FileDiscoveryService {
  private gitIgnoreFilter: GitIgnoreFilter | null = null;
  private irisIgnoreFilter: GitIgnoreFilter | null = null;
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
    if (isGitRepository(this.projectRoot)) {
      const parser = new GitIgnoreParser(this.projectRoot);
      try {
        parser.loadGitRepoPatterns();
      } catch (_error) {
        // ignore file not found
      }
      this.gitIgnoreFilter = parser;
    }
    const gParser = new GitIgnoreParser(this.projectRoot);
    try {
      gParser.loadPatterns(IRIS_IGNORE_FILE_NAME);
    } catch (_error) {
      // ignore file not found
    }
    this.irisIgnoreFilter = gParser;
  }

  /**
   * Filters a list of file paths based on git ignore rules
   */
  filterFiles(
    filePaths: string[],
    options: FilterFilesOptions = {
      respectGitIgnore: true,
      respectIrisIgnore: true,
    },
  ): string[] {
    return filePaths.filter((filePath) => {
      if (options.respectGitIgnore && this.shouldGitIgnoreFile(filePath)) {
        return false;
      }
      if (
        options.respectIrisIgnore &&
        this.shouldIrisIgnoreFile(filePath)
      ) {
        return false;
      }
      return true;
    });
  }

  /**
   * Checks if a single file should be git-ignored
   */
  shouldGitIgnoreFile(filePath: string): boolean {
    if (this.gitIgnoreFilter) {
      return this.gitIgnoreFilter.isIgnored(filePath);
    }
    return false;
  }

  /**
   * Checks if a single file should be iris-ignored
   */
  shouldIrisIgnoreFile(filePath: string): boolean {
    if (this.irisIgnoreFilter) {
      return this.irisIgnoreFilter.isIgnored(filePath);
    }
    return false;
  }

  /**
   * Unified method to check if a file should be ignored based on filtering options
   */
  shouldIgnoreFile(
    filePath: string,
    options: FilterFilesOptions = {},
  ): boolean {
    const { respectGitIgnore = true, respectIrisIgnore = true } = options;

    if (respectGitIgnore && this.shouldGitIgnoreFile(filePath)) {
      return true;
    }
    if (respectIrisIgnore && this.shouldIrisIgnoreFile(filePath)) {
      return true;
    }
    return false;
  }

  /**
   * Returns loaded patterns from .irisignore
   */
  getIrisIgnorePatterns(): string[] {
    return this.irisIgnoreFilter?.getPatterns() ?? [];
  }
}
