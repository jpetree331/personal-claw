import type { OpenClawPluginApi } from "../../src/plugins/types.js";
import { createCodeBridgeTools } from "./src/code-bridge-tool.js";

export default function register(api: OpenClawPluginApi) {
  const tools = createCodeBridgeTools(api);
  for (const tool of tools) {
    api.registerTool(tool, { optional: true });
  }
}
