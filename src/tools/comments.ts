/**
 * Comment tools for PLANKA MCP server.
 */
import {
  createComment,
  getCommentsForCard,
} from "../operations/comments.js";
import { PlankaError } from "../errors.js";
import { parseDetail, toText, stripNulls, toRows, capArray } from "../format.js";

/** Max comments rendered before a "… and N more" sentinel. */
const COMMENTS_CAP = 30;

/**
 * Tool: planka_add_comment
 * Add a comment to a card.
 */
export const addCommentTool = {
  name: "planka_add_comment",
  description:
    "Add a comment to a card. Use this for status updates, notes, or agent activity logs.",
  inputSchema: {
    type: "object" as const,
    properties: {
      cardId: {
        type: "string",
        description: "The card ID",
      },
      text: {
        type: "string",
        description: "Comment text (markdown supported)",
      },
    },
    required: ["cardId", "text"],
  },
  handler: async (params: { cardId: string; text: string }) => {
    try {
      const comment = await createComment({
        cardId: params.cardId,
        text: params.text,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: toText(
              stripNulls({
                success: true,
                comment: { id: comment.id, text: comment.text },
              })
            ),
          },
        ],
      };
    } catch (error) {
      if (error instanceof PlankaError) {
        return {
          content: [{ type: "text" as const, text: `Error: ${error.message}` }],
          isError: true,
        };
      }
      throw error;
    }
  },
};

/**
 * Tool: planka_get_comments
 * Get all comments on a card.
 */
export const getCommentsTool = {
  name: "planka_get_comments",
  description: "Get all comments on a card (newest first).",
  inputSchema: {
    type: "object" as const,
    properties: {
      cardId: {
        type: "string",
        description: "The card ID",
      },
      detail: {
        type: "string",
        enum: ["compact", "full"],
        description:
          "Output verbosity. 'compact' (default) omits timestamps; 'full' adds each comment's createdAt.",
        default: "compact",
      },
    },
    required: ["cardId"],
  },
  handler: async (params: { cardId: string; detail?: string }) => {
    try {
      const detail = parseDetail(params.detail);
      const comments = await getCommentsForCard(params.cardId);
      const { items, more } = capArray(comments, COMMENTS_CAP);

      const columns =
        detail === "full" ? ["id", "text", "created"] : ["id", "text"];
      const rows = toRows("comment", columns, items, (c) =>
        detail === "full" ? [c.id, c.text, c.createdAt] : [c.id, c.text]
      );

      const parts = [`comments: ${comments.length}`];
      if (rows) parts.push(rows);
      if (more > 0) parts.push(`… and ${more} more comment(s)`);

      return {
        content: [
          {
            type: "text" as const,
            text: parts.join("\n"),
          },
        ],
      };
    } catch (error) {
      if (error instanceof PlankaError) {
        return {
          content: [{ type: "text" as const, text: `Error: ${error.message}` }],
          isError: true,
        };
      }
      throw error;
    }
  },
};

export const commentTools = [addCommentTool, getCommentsTool];
