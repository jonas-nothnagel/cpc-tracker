import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "python/**",
      "old_scripts/**",
      "dev_data_scripts/**",
    ],
  },
  {
    // React Compiler validation rules from eslint-plugin-react-hooks v7 are
    // experimental and not yet adopted project-wide. Downgrade to warnings so
    // they surface for review without blocking lint. Revisit when the project
    // formally opts into React Compiler.
    rules: {
      "react-hooks/refs": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default config;
