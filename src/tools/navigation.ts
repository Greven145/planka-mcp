/**
 * Navigation tools for PLANKA MCP server.
 */
import { getStructure } from "../operations/projects.js";
import { getBoardWithTaskCounts } from "../operations/boards.js";
import { parseDetail, toRows, capArray, truncate } from "../format.js";

/** Max cards rendered per list before a "… and N more" sentinel. */
const CARDS_PER_LIST_CAP = 50;

/**
 * Tool: planka_get_structure
 * Get the full project/board/list hierarchy.
 */
export const getStructureTool = {
  name: "planka_get_structure",
  description:
    "Get the full project/board/list structure. Use this to understand what projects and boards exist before working with cards.",
  inputSchema: {
    type: "object" as const,
    properties: {
      projectId: {
        type: "string",
        description: "Optional: Get structure for a specific project only",
      },
    },
  },
  handler: async (params: { projectId?: string }) => {
    const structure = await getStructure(params.projectId);

    // Compact hierarchical text: "id" tags are kept because callers need them
    // to act on boards/lists; everything else is already just names.
    const lines: string[] = [];
    for (const project of structure) {
      lines.push(`project ${project.project.name} [${project.project.id}]`);
      for (const b of project.boards) {
        lines.push(`  board ${b.board.name} [${b.board.id}]`);
        const lists = b.lists
          .filter((l) => l.name !== null) // Filter out archive/trash
          .map((l) => `${l.name} [${l.id}]`);
        if (lists.length > 0) {
          lines.push(`    lists: ${lists.join(", ")}`);
        }
      }
    }

    return {
      content: [
        {
          type: "text" as const,
          text: lines.join("\n"),
        },
      ],
    };
  },
};

/**
 * Tool: planka_get_board
 * Get a board with all its lists, cards, and labels.
 */
export const getBoardTool = {
  name: "planka_get_board",
  description:
    "Get a board with all its lists, cards, and labels. Use this to see everything on a board.",
  inputSchema: {
    type: "object" as const,
    properties: {
      boardId: {
        type: "string",
        description: "The board ID",
      },
      includeTaskCounts: {
        type: "boolean",
        description: "Include task completion counts for each card",
        default: true,
      },
      detail: {
        type: "string",
        enum: ["compact", "full"],
        description:
          "Output verbosity. 'compact' (default) omits descriptions; 'full' adds each card's description.",
        default: "compact",
      },
    },
    required: ["boardId"],
  },
  handler: async (params: {
    boardId: string;
    includeTaskCounts?: boolean;
    detail?: string;
  }) => {
    const detail = parseDetail(params.detail);
    const showTaskCounts = params.includeTaskCounts !== false;
    const details = await getBoardWithTaskCounts(params.boardId);

    // Group cards by list
    const cardsByList = new Map<string, typeof details.cards>();
    for (const card of details.cards) {
      const listCards = cardsByList.get(card.listId) || [];
      listCards.push(card);
      cardsByList.set(card.listId, listCards);
    }

    // Build card -> label names lookup
    const labelById = new Map(details.labels.map((l) => [l.id, l]));
    const labelsByCard = new Map<string, string[]>();
    for (const cl of details.cardLabels) {
      const names = labelsByCard.get(cl.cardId) || [];
      const label = labelById.get(cl.labelId);
      if (label) names.push(label.name || label.color);
      labelsByCard.set(cl.cardId, names);
    }

    const columns =
      detail === "full"
        ? ["id", "name", "labels", "tasks", "due", "done", "desc"]
        : ["id", "name", "labels", "tasks", "due", "done"];

    const blocks: string[] = [
      `board: ${details.board.name} [${details.board.id}]`,
    ];

    const labelRows = toRows(
      "labels",
      ["id", "name", "color"],
      details.labels,
      (l) => [l.id, l.name, l.color]
    );
    if (labelRows) blocks.push(labelRows);

    for (const list of details.lists) {
      if (list.name === null) continue; // Filter archive/trash
      const all = (cardsByList.get(list.id) || []).sort(
        (a, b) => a.position - b.position
      );
      const { items, more } = capArray(all, CARDS_PER_LIST_CAP);
      blocks.push(`list: ${list.name} [${list.id}] (${all.length})`);

      const rows = toRows("card", columns, items, (card) => {
        const cells: unknown[] = [
          card.id,
          card.name,
          labelsByCard.get(card.id) || [],
          showTaskCounts && card.taskCount > 0
            ? `${card.completedTaskCount}/${card.taskCount}`
            : "",
          card.dueDate || "",
          card.isCompleted ? "✓" : "",
        ];
        if (detail === "full") {
          cells.push(card.description ? truncate(card.description, 500) : "");
        }
        return cells;
      });
      if (rows) blocks.push(rows);
      if (more > 0) {
        blocks.push(`… and ${more} more card(s) in this list`);
      }
    }

    return {
      content: [
        {
          type: "text" as const,
          text: blocks.join("\n"),
        },
      ],
    };
  },
};

export const navigationTools = [getStructureTool, getBoardTool];
