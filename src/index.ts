export { default as PebbleEditor } from "./components/PebbleEditor";
export type { PebbleEditorHandle, PebbleEditorProps } from "./components/PebbleEditor";

export { analyze, membersAfterDot, loadPebble, ensureProcessEnv, PebbleAnalysis } from "./language/analyze";
export type {
    AnalyzeOptions, PebbleCompletion, PebbleCompletionKind, PebbleDiagnostic,
    PebbleDiagnosticSeverity, PebbleEditorMode, PebbleHover, PebbleRange,
} from "./language/analyze";
export { attachPebbleModel, registerPebbleLanguageFeatures, addGoToDefinitionAction } from "./language/monacoPebble";
export type { PebbleModelOptions } from "./language/monacoPebble";
export { wrapScript, identitySource } from "./language/scriptWrap";
export type { MappedSource } from "./language/scriptWrap";
