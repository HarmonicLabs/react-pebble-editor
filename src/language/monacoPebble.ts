/**
 * Monaco glue for the answers of `analyze.ts`: markers, hover, go to definition, references,
 * highlights and completion for the `pebble` language. Monaco is the AMD build the page loads
 * (`window.monaco`), so it is passed in, never imported.
 */
import {
    analyze, membersAfterDot, PebbleAnalysis, PebbleCompletion, PebbleCompletionKind, PebbleDiagnostic,
    PebbleEditorMode, PebbleRange,
} from "./analyze";

export interface PebbleModelOptions {
    mode?: PebbleEditorMode;
    files?: Record<string, string>;
    /** called with the diagnostics of every check */
    onDiagnostics?: ( diagnostics: PebbleDiagnostic[] ) => void;
    /** ms of no typing before the text is checked again */
    debounceMs?: number;
}

interface ModelState {
    opts: PebbleModelOptions;
    analysis?: PebbleAnalysis;
    analysisVersion: number;
    pending?: Promise<PebbleAnalysis | undefined>;
    pendingVersion: number;
}

const states = new Map<string, ModelState>();
const registered = new WeakSet<object>();

/** the analysis of the model as it is now */
async function current( model: any ): Promise<PebbleAnalysis | undefined>
{
    const st = states.get( model.uri.toString() );
    if( !st ) return undefined;
    const version = model.getVersionId();
    if( st.analysis && st.analysisVersion === version ) return st.analysis;
    if( st.pending && st.pendingVersion === version ) return st.pending;
    st.pendingVersion = version;
    st.pending = analyze( model.getValue(), st.opts ).then( a => {
        if( model.isDisposed?.() ) return undefined;
        if( model.getVersionId() === version ) { st.analysis = a; st.analysisVersion = version; }
        return a;
    }).catch( ( e: any ) => {
        console.warn( "[react-pebble-editor] check failed:", e );
        return undefined;
    });
    return st.pending;
}

function toMonacoRange( monaco: any, model: any, r: PebbleRange ): any
{
    const s = model.getPositionAt( r.start );
    const e = model.getPositionAt( r.end );
    return new monaco.Range( s.lineNumber, s.column, e.lineNumber, e.column );
}

function completionKind( monaco: any, kind: PebbleCompletionKind ): number
{
    const K = monaco.languages.CompletionItemKind;
    switch( kind )
    {
        case "function": return K.Function;
        case "method": return K.Method;
        case "field": return K.Field;
        case "variable": return K.Variable;
        case "constant": return K.Constant;
        case "parameter": return K.Variable;
        case "struct": return K.Struct;
        case "constructor": return K.Constructor;
        case "type": return K.TypeParameter;
        case "enum": return K.Enum;
        case "enumMember": return K.EnumMember;
        case "interface": return K.Interface;
        case "namespace": return K.Module;
        case "contract": return K.Class;
        case "keyword": return K.Keyword;
        default: return K.Text;
    }
}

/** registers the providers of the `pebble` language once per Monaco */
export function registerPebbleLanguageFeatures( monaco: any ): void
{
    if( registered.has( monaco ) ) return;
    registered.add( monaco );
    const L = monaco.languages;

    L.registerHoverProvider( "pebble", {
        async provideHover( model: any, position: any ) {
            const a = await current( model );
            const h = a?.hoverAt( model.getOffsetAt( position ) );
            if( !h ) return null;
            return {
                range: toMonacoRange( monaco, model, h ),
                contents: [ { value: "```pebble\n" + h.signature + "\n```" } ],
            };
        }
    });

    L.registerDefinitionProvider( "pebble", {
        async provideDefinition( model: any, position: any ) {
            const a = await current( model );
            const d = a?.declarationAt( model.getOffsetAt( position ) );
            if( !d ) return null;
            // the whole declaration is what Ctrl+hover previews; the name is where it goes
            return [ {
                uri: model.uri,
                range: toMonacoRange( monaco, model, d.whole ),
                targetSelectionRange: toMonacoRange( monaco, model, d.name ),
            } ];
        }
    });

    L.registerReferenceProvider( "pebble", {
        async provideReferences( model: any, position: any ) {
            const a = await current( model );
            return ( a?.referencesAt( model.getOffsetAt( position ) ) ?? [] )
                .map( r => ({ uri: model.uri, range: toMonacoRange( monaco, model, r ) }) );
        }
    });

    L.registerDocumentHighlightProvider( "pebble", {
        async provideDocumentHighlights( model: any, position: any ) {
            const a = await current( model );
            return ( a?.referencesAt( model.getOffsetAt( position ) ) ?? [] )
                .map( r => ({ range: toMonacoRange( monaco, model, r ), kind: L.DocumentHighlightKind.Text }) );
        }
    });

    L.registerCompletionItemProvider( "pebble", {
        triggerCharacters: [ "." ],
        async provideCompletionItems( model: any, position: any ) {
            const st = states.get( model.uri.toString() );
            if( !st ) return { suggestions: [] };
            const text: string = model.getValue();
            const offset = model.getOffsetAt( position );
            const word = model.getWordUntilPosition( position );
            const range = new monaco.Range( position.lineNumber, word.startColumn, position.lineNumber, word.endColumn );
            const wordStart = model.getOffsetAt({ lineNumber: position.lineNumber, column: word.startColumn });

            let items: PebbleCompletion[];
            if( wordStart > 0 && text[ wordStart - 1 ] === "." )
                items = await membersAfterDot( text, wordStart - 1, st.opts );
            else
                items = ( await current( model ) )?.namesAt( offset ) ?? [];

            return {
                suggestions: items.map( ( c, i ) => ({
                    label: c.label,
                    kind: completionKind( monaco, c.kind ),
                    detail: c.detail,
                    insertText: c.label,
                    range,
                    sortText: ( c.kind === "keyword" ? "1" : "0" ) + String( i ).padStart( 4, "0" ),
                }) ),
            };
        }
    });
}

/**
 * Go to Definition (F12, and in the context menu) for an editor of a model attached with
 * `attachPebbleModel`. Ctrl/Cmd+click works without it; the Monaco build of
 * `@harmoniclabs/monaco-editor` does not register the F12 command.
 */
export function addGoToDefinitionAction( monaco: any, editor: any ): { dispose(): void } | undefined
{
    if( editor.getAction?.( "editor.action.revealDefinition" ) ) return undefined;
    return editor.addAction({
        id: "pebble.goToDefinition",
        label: "Go to Definition",
        keybindings: [ monaco.KeyCode.F12 ],
        contextMenuGroupId: "navigation",
        contextMenuOrder: 1,
        async run( ed: any ) {
            const model = ed.getModel();
            const a = await current( model );
            const d = a?.definitionAt( model.getOffsetAt( ed.getPosition() ) );
            if( !d ) return;
            const r = toMonacoRange( monaco, model, d );
            ed.setSelection( r );
            ed.revealRangeInCenterIfOutsideViewport( r );
            ed.focus();
        }
    });
}

const SEVERITY: Record<string, string> = { error: "Error", warning: "Warning", info: "Info" };

/**
 * checks `model` as it changes, shows the diagnostics as markers and answers the providers
 * for it; returns what stops it
 */
export function attachPebbleModel( monaco: any, model: any, opts: PebbleModelOptions = {} ): () => void
{
    registerPebbleLanguageFeatures( monaco );
    const key = model.uri.toString();
    const st: ModelState = { opts, analysisVersion: -1, pendingVersion: -1 };
    states.set( key, st );

    let timer: any = undefined;
    let disposed = false;
    const refresh = async () => {
        const a = await current( model );
        if( disposed || !a || model.getVersionId() !== st.analysisVersion ) return;
        monaco.editor.setModelMarkers( model, "pebble", a.diagnostics.map( d => {
            const r = toMonacoRange( monaco, model, d.end > d.start ? d : { start: d.start, end: d.start + 1 } );
            return {
                severity: monaco.MarkerSeverity[ SEVERITY[ d.severity ] ],
                message: d.message,
                code: d.code ? String( d.code ) : undefined,
                source: "pebble",
                startLineNumber: r.startLineNumber, startColumn: r.startColumn,
                endLineNumber: r.endLineNumber, endColumn: r.endColumn,
            };
        }) );
        opts.onDiagnostics?.( a.diagnostics );
    };
    const sub = model.onDidChangeContent( () => {
        clearTimeout( timer );
        timer = setTimeout( refresh, opts.debounceMs ?? 300 );
    });
    refresh().catch( e => console.warn( "[react-pebble-editor] diagnostics failed:", e ) );

    return () => {
        disposed = true;
        clearTimeout( timer );
        sub.dispose();
        if( states.get( key ) === st ) states.delete( key );
        if( !model.isDisposed?.() ) monaco.editor.setModelMarkers( model, "pebble", [] );
    };
}
