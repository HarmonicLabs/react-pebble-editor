/**
 * What an editor asks of a Pebble text, answered by the compiler's `check()`
 * (`@harmoniclabs/pebble` >= 0.6.0): diagnostics, types, definitions, references and the
 * names to complete. Offsets are those of the editor's text; nothing here depends on Monaco.
 */
import { identitySource, wrapScript, MappedSource } from "./scriptWrap";

export type PebbleModule = typeof import( "@harmoniclabs/pebble" );

let pebbleModule: Promise<PebbleModule> | undefined = undefined;

/**
 * `@harmoniclabs/pebble` (0.4.2 to 0.6.0 at least) reads `process.env` when its modules load,
 * for debugging switches: in a browser, where there is no `process`, loading it throws
 * ("process is not defined"). An empty one is enough; one that exists is left alone.
 */
export function ensureProcessEnv(): void
{
    const g = globalThis as any;
    if( typeof g.process === "undefined" ) g.process = { env: {} };
    else if( g.process && typeof g.process.env === "undefined" ) g.process.env = {};
}

/** `@harmoniclabs/pebble`, loaded once, when first needed */
export function loadPebble(): Promise<PebbleModule>
{
    if( !pebbleModule )
    {
        ensureProcessEnv();
        pebbleModule = import( "@harmoniclabs/pebble" );
    }
    return pebbleModule;
}

/**
 * `"file"`: the text is a Pebble file (declarations, contracts), as `pebble compile` takes it.
 * `"script"`: top-level statements, as the documentation's runnable examples and
 * `Compiler.run()` take them.
 */
export type PebbleEditorMode = "file" | "script";

export type PebbleDiagnosticSeverity = "error" | "warning" | "info";

export interface PebbleDiagnostic {
    severity: PebbleDiagnosticSeverity;
    code: number;
    message: string;
    /** offsets in the editor's text */
    start: number;
    end: number;
}

export interface PebbleHover {
    start: number;
    end: number;
    /** e.g. `(function) f: (int) => int` */
    signature: string;
}

export interface PebbleRange { start: number; end: number; }

export type PebbleCompletionKind =
    | "function" | "variable" | "constant" | "parameter" | "struct" | "constructor"
    | "field" | "method" | "type" | "enum" | "enumMember" | "interface" | "namespace"
    | "contract" | "keyword" | "other";

export interface PebbleCompletion {
    label: string;
    kind: PebbleCompletionKind;
    detail?: string;
}

export interface AnalyzeOptions {
    mode?: PebbleEditorMode;
    /**
     * other files of the project, by path relative to the root (`"lib.pebble"`), for
     * `import { … } from "./lib.pebble"`
     */
    files?: Record<string, string>;
}

const ENTRY = "main.pebble";

const KEYWORDS = [
    "const", "let", "function", "struct", "data", "type", "enum", "interface", "using", "import",
    "export", "from", "contract", "param", "state", "spend", "mint", "certify", "withdraw",
    "propose", "vote", "context", "test", "via", "if", "else", "for", "of", "while", "break",
    "continue", "return", "match", "when", "case", "is", "as", "trace", "fail", "assert",
    "true", "false", "int", "boolean", "bytes", "string", "void", "List", "LinearMap", "Optional",
];

function severityOf( category: number ): PebbleDiagnosticSeverity
{
    // DiagnosticCategory: Pedantic 0, Info 1, Warning 2, Error 3
    if( category >= 3 ) return "error";
    if( category === 2 ) return "warning";
    return "info";
}

function completionKindOf( kind: string ): PebbleCompletionKind
{
    switch( kind )
    {
        case "function": case "test": case "contractMethod": return "function";
        case "parameter": case "contractParam": return "parameter";
        case "constant": return "constant";
        case "variable": case "import": return "variable";
        case "struct": return "struct";
        case "constructor": return "constructor";
        case "field": return "field";
        case "method": return "method";
        case "type": case "typeParameter": return "type";
        case "enum": return "enum";
        case "enumMember": return "enumMember";
        case "interface": return "interface";
        case "namespace": return "namespace";
        case "contract": return "contract";
        default: return "other";
    }
}

/** a type to show: not one the compiler made up (`§…`) */
function usableType( t: any ): boolean
{
    const s = typeString( t );
    return !!s && !s.startsWith( "\u00a7" );
}

function typeString( t: any ): string | undefined
{
    if( !t ) return undefined;
    try { return String( t.toString() ); } catch { return undefined; }
}

/** The answers for one version of a text. */
export class PebbleAnalysis
{
    constructor(
        /** the editor's text */
        readonly text: string,
        readonly mapped: MappedSource,
        /** the `CheckResult`, `undefined` when the check threw */
        readonly result: any | undefined,
        /** the entry as the compiler names it */
        readonly entry: string,
        readonly diagnostics: PebbleDiagnostic[],
    ) {}

    private gen( offset: number ): number | undefined
    {
        return this.mapped.toGenerated( offset );
    }

    private origRange( r: { start: number; end: number } | undefined ): PebbleRange | undefined
    {
        if( !r ) return undefined;
        const start = this.mapped.toOriginal( r.start );
        const end = this.mapped.toOriginal( r.end );
        if( start === undefined || end === undefined ) return undefined;
        return { start, end };
    }

    /** a symbol's type: its own, or that of its name where it is declared, or where it is used */
    private typeOfSymbol( sym: any ): any
    {
        if( !sym ) return undefined;
        if( sym.type && usableType( sym.type ) ) return sym.type;
        const stm = this.result?.sourceTypeMap;
        if( !stm ) return undefined;
        const exact = ( file: string, r: any ) => {
            if( !r ) return undefined;
            for( const e of stm.entriesOf( file ) )
                if( e.start === r.start && e.end === r.end && usableType( e.type ) ) return e.type;
            return undefined;
        };
        const atDecl = exact( sym.source, sym.nameRange );
        if( atDecl ) return atDecl;
        try {
            for( const ref of this.result.symbols.references( sym ) )
            {
                const t = exact( ref.range?.source?.absoluteProjPath ?? sym.source, ref.range );
                if( t ) return t;
            }
        } catch {}
        return undefined;
    }

    /** the symbol named at `offset`, with the range naming it there */
    private symbolAt( offset: number ): { symbol: any; range: PebbleRange | undefined } | undefined
    {
        const symbols = this.result?.symbols;
        const gen = this.gen( offset );
        if( !symbols || gen === undefined ) return undefined;
        const ref = symbols.referenceAt( this.entry, gen );
        if( ref ) return { symbol: ref.symbol, range: this.origRange( ref.range ) };
        const symbol = symbols.symbolAt( this.entry, gen );
        if( !symbol ) return undefined;
        return { symbol, range: symbol.source === this.entry ? this.origRange( symbol.nameRange ) : undefined };
    }

    hoverAt( offset: number ): PebbleHover | undefined
    {
        const gen = this.gen( offset );
        if( gen === undefined || !this.result ) return undefined;
        const found = this.symbolAt( offset );
        const entry = this.result.sourceTypeMap?.typeAt( this.entry, gen );
        if( found )
        {
            const sym = found.symbol;
            const t = typeString( this.typeOfSymbol( sym ) ) ?? typeString( entry?.type );
            const container = sym.container ? sym.container.name + "." : "";
            const signature = `(${sym.kind}) ${container}${sym.name}` + ( t ? `: ${t}` : "" );
            const range = found.range ?? this.origRange( entry ) ?? { start: offset, end: offset };
            return { ...range, signature };
        }
        if( entry )
        {
            const range = this.origRange( entry );
            const t = typeString( entry.type );
            if( range && t ) return { ...range, signature: entry.name ? `${entry.name}: ${t}` : t };
        }
        return undefined;
    }

    /** where what is named at `offset` is declared, if in this text */
    definitionAt( offset: number ): PebbleRange | undefined
    {
        return this.declarationAt( offset )?.name;
    }

    /** the declaration of what is named at `offset`, if in this text: its name and all of it */
    declarationAt( offset: number ): { name: PebbleRange; whole: PebbleRange } | undefined
    {
        const found = this.symbolAt( offset );
        if( !found ) return undefined;
        const def = this.result.symbols.definitionOf( found.symbol );
        if( !def || def.source !== this.entry ) return undefined;
        const name = this.origRange( def.nameRange );
        if( !name ) return undefined;
        const whole = this.origRange( def.range );
        return { name, whole: whole && whole.start <= name.start && name.end <= whole.end ? whole : name };
    }

    /** the declaration and the uses of what is named at `offset`, in this text */
    referencesAt( offset: number ): PebbleRange[]
    {
        const found = this.symbolAt( offset );
        if( !found ) return [];
        const symbols = this.result.symbols;
        const def = symbols.definitionOf( found.symbol );
        const out: PebbleRange[] = [];
        if( def?.source === this.entry )
        {
            const r = this.origRange( def.nameRange );
            if( r ) out.push( r );
        }
        for( const ref of symbols.references( def ?? found.symbol ) )
        {
            const src = ref.range?.source?.absoluteProjPath;
            if( typeof src === "string" && src !== this.entry ) continue;
            const r = this.origRange( ref.range );
            if( r && !out.some( o => o.start === r.start && o.end === r.end ) ) out.push( r );
        }
        return out.sort( ( a, b ) => a.start - b.start );
    }

    /**
     * the members of the value whose expression ends at `exprEnd`, the offset of the `.` typed
     * after it: give it the analysis of the text without that `.` (see `analyzeForMembers`)
     */
    membersAt( exprEnd: number ): PebbleCompletion[]
    {
        const stm = this.result?.sourceTypeMap;
        if( !stm || exprEnd <= 0 ) return [];
        const gen = this.gen( exprEnd - 1 );
        if( gen === undefined ) return [];
        const usable = usableType;
        // the largest expression ending right before the `.`: `a.b` rather than `b`
        let type: any = undefined;
        let size = -1;
        for( const e of stm.entriesOf( this.entry ) )
        {
            if( e.end === gen + 1 && e.start <= gen && usable( e.type ) && ( e.end - e.start ) > size )
            {
                type = e.type;
                size = e.end - e.start;
            }
        }
        // the statement did not type-check (`assert tx.` is `assert tx` without the dot):
        // the name before the dot, as it is declared
        if( !type )
        {
            let i = exprEnd;
            while( i > 0 && /[\w$]/.test( this.text[ i - 1 ] ) ) i--;
            const name = this.text.slice( i, exprEnd );
            const before = i > 0 ? this.text[ i - 1 ] : "";
            const symbols = this.result?.symbols;
            if( name && before !== "." && symbols && typeof symbols.visibleAt === "function" )
            {
                const at = this.gen( i ) ?? gen;
                let visible: any[] = [];
                try { visible = symbols.visibleAt( this.entry, at ) ?? []; } catch { visible = []; }
                const sym = visible.find( s => s.name === name );
                if( sym ) type = this.typeOfSymbol( sym );
            }
        }
        if( !type ) return [];
        let members: any[] = [];
        try { members = stm.membersOfType( type ) ?? []; } catch { members = []; }
        return members.map( m => ({
            label: m.name,
            kind: m.kind === "method" ? "method" : "field",
            detail: typeString( m.type ),
        }) );
    }

    /** the names that can be written at `offset`, and the keywords */
    namesAt( offset: number ): PebbleCompletion[]
    {
        const out: PebbleCompletion[] = [];
        const seen = new Set<string>();
        const symbols = this.result?.symbols;
        // at the end of the text, the analysis may not know the offset yet: use the last one
        const gen = this.gen( offset ) ?? this.gen( Math.min( offset, this.text.length ) ) ?? this.mapped.text.length;
        if( symbols && typeof symbols.visibleAt === "function" )
        {
            let visible: any[] = [];
            try { visible = symbols.visibleAt( this.entry, gen ) ?? []; } catch { visible = []; }
            for( const s of visible )
            {
                if( seen.has( s.name ) || s.name.startsWith( "__pebble_" ) ) continue;
                seen.add( s.name );
                out.push({ label: s.name, kind: completionKindOf( s.kind ), detail: typeString( this.typeOfSymbol( s ) ) });
            }
        }
        for( const k of KEYWORDS )
            if( !seen.has( k ) ) out.push({ label: k, kind: "keyword" });
        return out;
    }
}

/**
 * the members to complete after the `.` at `dotOffset` of `text`: the text is checked without
 * that `.` (and what was typed after it), where the expression before it has a type
 */
export async function membersAfterDot( text: string, dotOffset: number, opts: AnalyzeOptions = {} ): Promise<PebbleCompletion[]>
{
    let end = dotOffset + 1;
    while( end < text.length && /[\w$]/.test( text[ end ] ) ) end++;
    const without = text.slice( 0, dotOffset ) + text.slice( end );
    const a = await analyze( without, opts );
    return a.membersAt( dotOffset );
}

let checkQueue: Promise<unknown> = Promise.resolve();

/** checks `text`; one check at a time, the compiler holds global state while it runs */
export function analyze( text: string, opts: AnalyzeOptions = {} ): Promise<PebbleAnalysis>
{
    const run = checkQueue.then( () => analyzeNow( text, opts ) );
    checkQueue = run.catch( () => undefined );
    return run;
}

async function analyzeNow( text: string, opts: AnalyzeOptions ): Promise<PebbleAnalysis>
{
    const pebble = await loadPebble();
    const mapped = ( opts.mode ?? "file" ) === "script" ? wrapScript( text ) : identitySource( text );

    const sources = new Map<string, Uint8Array>();
    sources.set( ENTRY, pebble.fromUtf8( mapped.text ) );
    for( const [ name, content ] of Object.entries( opts.files ?? {} ) )
        sources.set( name.replace( /^\.?\/+/, "" ), pebble.fromUtf8( content ) );

    const io = pebble.createMemoryCompilerIoApi({ sources, outputs: new Map(), useConsoleAsOutput: false });
    const compiler = new pebble.Compiler( io, { ...pebble.defaultOptions, compilerVersion: pebble.COMPILER_VERSION } as any );

    let result: any = undefined;
    let thrown: string | undefined = undefined;
    try {
        result = await compiler.check({ entry: ENTRY, root: "/" } as any );
    }
    catch( e: any ) {
        thrown = String( e?.message ?? e );
    }

    const entry: string = result?.sourceTypeMap?.entry ?? "/" + ENTRY;
    const diagnostics: PebbleDiagnostic[] = [];
    const diags: any[] = result?.diagnostics ?? ( compiler as any ).diagnostics ?? [];
    for( const d of diags )
    {
        if( !d?.message ) continue;
        const src = d.range?.source?.absoluteProjPath ?? d.range?.source;
        // a diagnostic of another file (an import) shows at the start of the text
        const inEntry = !src || typeof src !== "string" || src === entry || src.endsWith( ENTRY );
        let start = 0, end = 0;
        if( d.range && inEntry )
        {
            start = mapped.toOriginalNearest( d.range.start );
            end = Math.max( start, mapped.toOriginalNearest( d.range.end ) );
        }
        const message = inEntry || typeof src !== "string" ? d.message : `${src}: ${d.message}`;
        if( diagnostics.some( x => x.start === start && x.end === end && x.message === message ) ) continue;
        diagnostics.push({ severity: severityOf( d.category ), code: d.code, message, start, end });
    }
    if( thrown && !diagnostics.some( d => d.severity === "error" ) )
        diagnostics.push({ severity: "error", code: 0, message: thrown, start: 0, end: 0 });

    return new PebbleAnalysis( text, mapped, result, entry, diagnostics );
}
