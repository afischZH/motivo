import type {
  AnyToolDefinition,
  ParamsSchema,
  RegionEditor,
  RegionValues,
  ToolCategory,
  ToolDefinition,
} from "./types";

/** Kebab-case: lowercase letters and digits, single hyphens between words. */
export const TOOL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Identity helper that infers and checks the schema type of a tool, so
 * `defaults`, `presets`, `randomize` and `render` are typed against it.
 */
export function defineTool<S extends ParamsSchema>(tool: ToolDefinition<S>): ToolDefinition<S> {
  return tool;
}

/**
 * Types a region editor against its own value type and erases that type for
 * `ToolDefinition.regionEditor` (the editor shell only sees plain records,
 * like the item sub-forms of list params).
 */
export function defineRegionEditor<P, V extends RegionValues>(
  editor: RegionEditor<P, V>,
): RegionEditor<P> {
  return editor as unknown as RegionEditor<P>;
}

export interface ToolRegistry {
  /** Adds a tool. Throws on an invalid or duplicate id. Returns the tool. */
  register<T extends AnyToolDefinition>(tool: T): T;
  get(id: string): AnyToolDefinition | undefined;
  has(id: string): boolean;
  /** All tools in registration order. */
  list(): readonly AnyToolDefinition[];
  /** Tools that list `category` anywhere in their categories, in registration order. */
  listByCategory(category: ToolCategory): readonly AnyToolDefinition[];
}

export function createRegistry(): ToolRegistry {
  const tools = new Map<string, AnyToolDefinition>();

  return {
    register(tool) {
      if (!TOOL_ID_PATTERN.test(tool.id)) {
        throw new Error(`Invalid tool id "${tool.id}": expected kebab-case`);
      }
      if (tools.has(tool.id)) {
        throw new Error(`Duplicate tool id "${tool.id}"`);
      }
      tools.set(tool.id, tool);
      return tool;
    },
    get: (id) => tools.get(id),
    has: (id) => tools.has(id),
    list: () => [...tools.values()],
    listByCategory: (category) => [...tools.values()].filter((t) => t.category.includes(category)),
  };
}

/** The app-wide registry. Tools register themselves in `src/tools/index.ts` (from M1-AP02 on). */
export const registry: ToolRegistry = createRegistry();
