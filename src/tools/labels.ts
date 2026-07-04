/**
 * Label tools for PLANKA MCP server.
 */
import {
  createLabel,
  updateLabel,
  deleteLabel,
  setCardLabels,
} from "../operations/labels.js";
import { LabelColorSchema } from "../schemas/entities.js";
import { PlankaError } from "../errors.js";
import { toText, stripNulls } from "../format.js";

// Valid colors for the schema description
const validColors = LabelColorSchema.options.join(", ");

/**
 * Tool: planka_manage_labels
 * Create, update, or delete labels on a board.
 */
export const manageLabelsTool = {
  name: "planka_manage_labels",
  description: "Create, update, or delete labels on a board.",
  inputSchema: {
    type: "object" as const,
    properties: {
      action: {
        type: "string",
        enum: ["create", "update", "delete"],
        description: "Action to perform",
      },
      boardId: {
        type: "string",
        description: "Board ID (required for create)",
      },
      labelId: {
        type: "string",
        description: "Label ID (required for update/delete)",
      },
      name: {
        type: "string",
        description: "Label name",
      },
      color: {
        type: "string",
        description:
          "Label color (Planka palette slug, e.g. berry-red, lagoon-blue, egg-yellow). On an invalid value the error lists all valid colors.",
      },
    },
    required: ["action"],
  },
  handler: async (params: {
    action: "create" | "update" | "delete";
    boardId?: string;
    labelId?: string;
    name?: string;
    color?: string;
  }) => {
    try {
      switch (params.action) {
        case "create": {
          if (!params.boardId) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: boardId is required for create action",
                },
              ],
              isError: true,
            };
          }
          if (!params.name) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: name is required for create action",
                },
              ],
              isError: true,
            };
          }
          if (!params.color) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: color is required for create action",
                },
              ],
              isError: true,
            };
          }

          // Validate color
          const colorParse = LabelColorSchema.safeParse(params.color);
          if (!colorParse.success) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error: Invalid color '${params.color}'. Valid colors: ${validColors}`,
                },
              ],
              isError: true,
            };
          }

          const label = await createLabel({
            boardId: params.boardId,
            name: params.name,
            color: colorParse.data,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: toText(stripNulls(
                  {
                    success: true,
                    label: {
                      id: label.id,
                      name: label.name,
                      color: label.color,
                    },
                  })),
              },
            ],
          };
        }

        case "update": {
          if (!params.labelId) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: labelId is required for update action",
                },
              ],
              isError: true,
            };
          }

          const updates: Record<string, unknown> = {};
          if (params.name !== undefined) updates.name = params.name;
          if (params.color !== undefined) {
            const colorParse = LabelColorSchema.safeParse(params.color);
            if (!colorParse.success) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: `Error: Invalid color '${params.color}'. Valid colors: ${validColors}`,
                  },
                ],
                isError: true,
              };
            }
            updates.color = colorParse.data;
          }

          const label = await updateLabel(params.labelId, updates);

          return {
            content: [
              {
                type: "text" as const,
                text: toText(stripNulls(
                  {
                    success: true,
                    label: {
                      id: label.id,
                      name: label.name,
                      color: label.color,
                    },
                  })),
              },
            ],
          };
        }

        case "delete": {
          if (!params.labelId) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: labelId is required for delete action",
                },
              ],
              isError: true,
            };
          }

          await deleteLabel(params.labelId);

          return {
            content: [
              {
                type: "text" as const,
                text: toText(stripNulls(
                  {
                    success: true,
                    message: `Label ${params.labelId} deleted`,
                  })),
              },
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Unknown action '${params.action}'`,
              },
            ],
            isError: true,
          };
      }
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
 * Tool: planka_set_card_labels
 * Add or remove labels from a card.
 */
export const setCardLabelsTool = {
  name: "planka_set_card_labels",
  description: "Add or remove labels from a card.",
  inputSchema: {
    type: "object" as const,
    properties: {
      cardId: {
        type: "string",
        description: "The card ID",
      },
      addLabelIds: {
        type: "array",
        items: { type: "string" },
        description: "Label IDs to add",
      },
      removeLabelIds: {
        type: "array",
        items: { type: "string" },
        description: "Label IDs to remove",
      },
    },
    required: ["cardId"],
  },
  handler: async (params: {
    cardId: string;
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }) => {
    try {
      await setCardLabels(
        params.cardId,
        params.addLabelIds,
        params.removeLabelIds
      );

      return {
        content: [
          {
            type: "text" as const,
            text: toText(stripNulls(
              {
                success: true,
                cardId: params.cardId,
                labelsAdded: params.addLabelIds?.length || 0,
                labelsRemoved: params.removeLabelIds?.length || 0,
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

export const labelTools = [manageLabelsTool, setCardLabelsTool];
