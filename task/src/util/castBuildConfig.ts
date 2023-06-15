import { IGitConfig } from "@pr/aws-core";
import { BuildContextType } from "../buildContext.js";

export const castGitConfig = (buildContext: BuildContextType): IGitConfig => {
  return {
    buildDirectory: buildContext.buildDirectory,
    buildReason: buildContext.buildReason,
    clonePath: buildContext.clonePath,
    projectName: buildContext.projectName,
    repoUrl: buildContext.repoUrl,
    sourceBranch: buildContext.sourceBranch,
    targetBranch: buildContext.targetBranch,
    prId: buildContext.prId,
  };
};
