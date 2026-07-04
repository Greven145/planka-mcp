/**
 * Card tools for PLANKA MCP server.
 */
import {
  createCard,
  getCard,
  updateCard,
  moveCard,
  deleteCard,
} from "../operations/cards.js";
import { getCommentsForCard } from "../operations/comments.js";
import { createTasks } from "../operations/tasks.js";
import { addLabelToCard } from "../operations/labels.js";
import { PlankaError } from "../errors.js";
import { parseDetail, toText, stripNulls, toRows, capArray } from "../format.js";

/** Max comments rendered before a "… and N more" sentinel. */
const COMMENTS_CAP = 30;

/**
 * Tool: planka_create_card
 * Create a new card on a board.
 */
export const createCardTool = {
  name: "planka_create_card",
  description:
    "Create a new card on a board. Optionally add tasks (checklist items) at the same time.",
  inputSchema: {
    type: "object" as const,
    properties: {
      listId: {
        type: "string",
        description: "The list to create the card in",
      },
      name: {
        type: "string",
        description: "Card title",
      },
      description: {
        type: "string",
        description: "Card description (markdown supported)",
      },
      tasks: {
        type: "array",
        items: { type: "string" },
        description: "Optional: Task names to add as a checklist",
      },
      dueDate: {
        type: "string",
        description: "Due date in ISO format",
      },
      labelIds: {
        type: "array",
        items: { type: "string" },
        description: "Optional: Label IDs to attach",
      },
    },
    required: ["listId", "name"],
  },
  handler: async (params: {
    listId: string;
    name: string;
    description?: string;
    tasks?: string[];
    dueDate?: string;
    labelIds?: string[];
  }) => {
    try {
      // Create the card
      const card = await createCard({
        listId: params.listId,
        name: params.name,
        description: params.description,
        dueDate: params.dueDate,
      });

      // Add tasks if provided
      if (params.tasks && params.tasks.length > 0) {
        await createTasks({
          cardId: card.id,
          tasks: params.tasks.map((name) => ({ name })),
        });
      }

      // Add labels if provided
      let labelsAttached = 0;
      const labelErrors: string[] = [];
      if (params.labelIds && params.labelIds.length > 0) {
        for (const labelId of params.labelIds) {
          try {
            await addLabelToCard({ cardId: card.id, labelId });
            labelsAttached++;
          } catch (error) {
            // Track failed labels but continue
            labelErrors.push(labelId);
          }
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: toText(stripNulls(
              {
                success: true,
                card: {
                  id: card.id,
                  name: card.name,
                  listId: card.listId,
                },
                tasksCreated: params.tasks?.length || 0,
                labelsAttached,
                ...(labelErrors.length > 0 && { labelErrors }),
              })),
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
 * Tool: planka_get_card
 * Get full details of a card.
 */
export const getCardTool = {
  name: "planka_get_card",
  description:
    "Get full details of a card including tasks, comments, labels, and attachments.",
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
          "Output verbosity. 'compact' (default) omits timestamps; 'full' adds createdAt/boardId and comment timestamps.",
        default: "compact",
      },
    },
    required: ["cardId"],
  },
  handler: async (params: { cardId: string; detail?: string }) => {
    try {
      const detail = parseDetail(params.detail);
      const [details, comments] = await Promise.all([
        getCard(params.cardId),
        getCommentsForCard(params.cardId),
      ]);

      // Card header — empty/null fields are dropped by stripNulls. Timestamps
      // and boardId only ship in 'full'.
      const card = stripNulls({
        id: details.card.id,
        name: details.card.name,
        description: details.card.description,
        listId: details.card.listId,
        dueDate: details.card.dueDate,
        isCompleted: details.card.isCompleted,
        boardId: detail === "full" ? details.card.boardId : undefined,
        createdAt: detail === "full" ? details.card.createdAt : undefined,
      });

      const labelDescriptors = details.cardLabels.map((cl) => {
        const label = details.labels.find((l) => l.id === cl.labelId);
        return label?.name || label?.color || cl.labelId;
      });

      const blocks: string[] = [`card: ${toText(card)}`];

      if (labelDescriptors.length > 0) {
        blocks.push(`labels: ${labelDescriptors.join(", ")}`);
      }

      const taskRows = toRows(
        "task",
        ["id", "name", "done"],
        details.tasks,
        (t) => [t.id, t.name, t.isCompleted ? "✓" : ""]
      );
      if (taskRows) blocks.push(taskRows);

      const { items: shownComments, more } = capArray(comments, COMMENTS_CAP);
      const commentCols =
        detail === "full" ? ["id", "text", "created"] : ["id", "text"];
      const commentRows = toRows("comment", commentCols, shownComments, (c) =>
        detail === "full" ? [c.id, c.text, c.createdAt] : [c.id, c.text]
      );
      if (commentRows) blocks.push(commentRows);
      if (more > 0) blocks.push(`… and ${more} more comment(s)`);

      const attachmentRows = toRows(
        "attachment",
        ["id", "name"],
        details.attachments,
        (a) => [a.id, a.name]
      );
      if (attachmentRows) blocks.push(attachmentRows);

      return {
        content: [
          {
            type: "text" as const,
            text: blocks.join("\n"),
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
 * Tool: planka_update_card
 * Update a card's properties.
 */
export const updateCardTool = {
  name: "planka_update_card",
  description:
    "Update a card's properties (name, description, due date, completion status).",
  inputSchema: {
    type: "object" as const,
    properties: {
      cardId: {
        type: "string",
        description: "The card ID",
      },
      name: {
        type: "string",
        description: "New card title",
      },
      description: {
        type: ["string", "null"],
        description: "New description (null to clear)",
      },
      dueDate: {
        type: ["string", "null"],
        description: "New due date (null to clear)",
      },
      isCompleted: {
        type: "boolean",
        description: "Mark card as complete/incomplete",
      },
    },
    required: ["cardId"],
  },
  handler: async (params: {
    cardId: string;
    name?: string;
    description?: string | null;
    dueDate?: string | null;
    isCompleted?: boolean;
  }) => {
    try {
      const { cardId, ...updates } = params;

      // Only include defined fields
      const filteredUpdates: Record<string, unknown> = {};
      if (updates.name !== undefined) filteredUpdates.name = updates.name;
      if (updates.description !== undefined)
        filteredUpdates.description = updates.description;
      if (updates.dueDate !== undefined)
        filteredUpdates.dueDate = updates.dueDate;
      if (updates.isCompleted !== undefined)
        filteredUpdates.isCompleted = updates.isCompleted;

      const card = await updateCard(cardId, filteredUpdates);

      return {
        content: [
          {
            type: "text" as const,
            text: toText(stripNulls(
              {
                success: true,
                card: {
                  id: card.id,
                  name: card.name,
                  description: card.description,
                  dueDate: card.dueDate,
                  isCompleted: card.isCompleted,
                },
              })),
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
 * Tool: planka_move_card
 * Move a card to a different list or position.
 */
export const moveCardTool = {
  name: "planka_move_card",
  description:
    "Move a card to a different list or position. Use this for workflow transitions (e.g., 'To Do' -> 'In Progress').",
  inputSchema: {
    type: "object" as const,
    properties: {
      cardId: {
        type: "string",
        description: "The card ID",
      },
      listId: {
        type: "string",
        description: "Target list ID",
      },
      position: {
        type: "number",
        description:
          "Position in the list (lower = higher). Default: end of list",
      },
    },
    required: ["cardId", "listId"],
  },
  handler: async (params: {
    cardId: string;
    listId: string;
    position?: number;
  }) => {
    try {
      const card = await moveCard({
        cardId: params.cardId,
        listId: params.listId,
        position: params.position ?? 65536,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: toText(stripNulls(
              {
                success: true,
                card: {
                  id: card.id,
                  name: card.name,
                  listId: card.listId,
                },
              })),
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
 * Tool: planka_delete_card
 * Permanently delete a card.
 */
export const deleteCardTool = {
  name: "planka_delete_card",
  description: "Permanently delete a card. This cannot be undone.",
  inputSchema: {
    type: "object" as const,
    properties: {
      cardId: {
        type: "string",
        description: "The card ID to delete",
      },
    },
    required: ["cardId"],
  },
  handler: async (params: { cardId: string }) => {
    try {
      await deleteCard(params.cardId);

      return {
        content: [
          {
            type: "text" as const,
            text: toText(stripNulls(
              {
                success: true,
                message: `Card ${params.cardId} deleted`,
              })),
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

export const cardTools = [
  createCardTool,
  getCardTool,
  updateCardTool,
  moveCardTool,
  deleteCardTool,
];
