import { allowUiImports, config } from "@linkedin-ops/config/eslint";
import { react } from "@linkedin-ops/config/eslint/react";

export default config(...react(), allowUiImports);
