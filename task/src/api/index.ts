import { WebApi, getPersonalAccessTokenHandler } from "azure-devops-node-api";
import { BuildContextType, buildContext } from "../buildContext.js";
import { GitPullRequestCommentThread } from "azure-devops-node-api/interfaces/GitInterfaces.js";
import { threadId } from "worker_threads";

export type Threads = GitPullRequestCommentThread;

export class ApiClient {
  private COMMENT_IDENTIFIER = "LIVE_URL_MESSAGE";
  private MS_COMMENTS_AUTHOR = "Microsoft.VisualStudio.Services";

  private prAuthor: string | null;

  constructor(private connection: WebApi, private buildCtx: BuildContextType) {
    this.prAuthor = null;
  }

  static async initializeApi() {
    if (!buildContext?.token) throw new Error("Token not found");

    const authHandler = getPersonalAccessTokenHandler(
      buildContext.token as string
    );
    const connection = new WebApi(buildContext.orgUrl, authHandler, {});
    await connection.connect();
    return new ApiClient(connection, buildContext);
  }

  async getLabels(repoId: string, prId: number) {
    try {
      if (!this.connection?.getGitApi) return;

      const api = await this.connection.getGitApi();
      return await api.getPullRequestLabels(repoId, prId);
    } catch (error) {
      throw new Error("API-ERROR: failed to get labels", { cause: error });
    }
  }

  async getCurrentPR() {
    try {
      const { prId } = this.buildCtx;
      return await this.getPRById(prId);
    } catch (e) {
      throw new Error("API_ERROR: failed to get pr");
    }
  }

  async getPRById(prId: string) {
    try {
      if (!prId || !Number(prId)) throw new Error("Please provide the PR id");

      const api = await this.connection.getGitApi();
      return await api.getPullRequestById(Number(prId));
    } catch (error) {
      throw new Error("API_ERROR: failed to get pr");
    }
  }

  async getPrAuthor() {
    if (this.prAuthor) return this.prAuthor;

    try {
      const api = await this.connection.getGitApi();
      const { prId, repoId } = this.buildCtx;

      if (prId) {
        const pr = await api.getPullRequestById(Number(prId));
        return (this.prAuthor = pr.createdBy?.displayName || null);
      }
    } catch (error) {
      throw new Error("Can not find PR author");
    }
  }

  async getAllThreads() {
    try {
      const api = await this.connection.getGitApi();
      return await api
        .getThreads(buildContext.repoId, Number(buildContext.prId))
        .then((res) => {
          return res
            .filter(
              (thread) =>
                !thread.comments?.[0].author?.displayName?.includes(
                  this.MS_COMMENTS_AUTHOR
                )
            )
            .filter((comment) => !comment?.isDeleted);
        })
        .catch((e) => {
          throw e;
        });
    } catch (error) {
      throw new Error("API-ERROR: failed to get thread", { cause: error });
    }
  }

  async createComment(commentMessage: string) {
    const api = await this.connection.getGitApi();

    const comment = [
      {
        content: await this.generateMessage(commentMessage),
      },
    ];

    const thread: GitPullRequestCommentThread = {
      comments: comment,
      status: 1,
      properties: {},
    };

    return await api
      .createThread(thread, this.buildCtx.repoId, Number(this.buildCtx.prId))
      .then((res) => {
        console.log({ res });
      })
      .catch((e) => {
        console.error(e);
      });
  }

  private async generateMessage(comment: string) {
    try {
      const prAuthor = await this.getPrAuthor();

      if (prAuthor) {
        return `${this.COMMENT_IDENTIFIER}: Thanks ${this.prAuthor} for creating PR.\n ${comment}`;
      }
      return `${this.COMMENT_IDENTIFIER}: ${comment}`;
    } catch (error) {
      throw new Error("MessageGenerateFailed: failed to generate comment");
    }
  }

  async updateComment(comment: {
    commentId: number;
    message: string;
    threadId: number;
  }) {
    const api = await this.connection.getGitApi();
    const commentPayload = {
      content: await this.generateMessage(comment.message),
      id: comment.commentId,
    };

    try {
      return await api
        .updateComment(
          commentPayload,
          this.buildCtx.repoId,
          Number(this.buildCtx.prId),
          threadId,
          comment.commentId
        )
        .then((res) => {
          console.log({ addedComment: res });
        });
    } catch (error) {
      throw error;
    }
  }

  async updateThreads() {
    try {
      const api = await this.connection.getGitApi();
      return;
    } catch (error) {
      throw new Error("API-ERROR: failed to update thread");
    }
  }
}
