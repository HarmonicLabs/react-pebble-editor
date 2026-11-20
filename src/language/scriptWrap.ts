/**
 * Script mode: a snippet of top-level statements, as `Compiler.run()` takes it.
 *
 * `run()` wraps the statements that are not declarations in a function before it compiles
 * (pebble `_wrapSourceTextForRun`): the declarations first, then
 * `function <name>(): void { <statements> }`. This does the same, and remembers where each
 * piece of the original text went, so that the positions `check()` answers with can be
 * mapped back to the editor's text, and the editor's positions forward.
 */

/** a piece of the original text, copied whole to the generated text */
export interface Segment {
    /** start in the original text */
    orig: number;
    /** start in the generated text */
    gen: number;
    len: number;
}

export interface MappedSource {
    /** the text the compiler checks */
    text: string;
    segments: Segment[];
    /** generated -> original; `undefined` for text the wrapper added */
    toOriginal( gen: number ): number | undefined;
    /** generated -> original; text the wrapper added goes to the nearest original position */
    toOriginalNearest( gen: number ): number;
    /** original -> generated; `undefined` between statements (whitespace) */
    toGenerated( orig: number ): number | undefined;
}

/** same as pebble's `_declKeywords` */
const DECL_KEYWORDS = new Set([
    "import", "export", "function", "struct", "enum", "type", "interface", "contract", "data", "runtime",
]);

function isWhitespace( ch: number ): boolean
{
    return ch === 0x20 || ch === 0x09 || ch === 0x0A || ch === 0x0D;
}

function readWord( text: string, pos: number ): string
{
    const start = pos;
    while( pos < text.length )
    {
        const ch = text.charCodeAt( pos );
        if(
            ( ch >= 0x61 && ch <= 0x7A ) ||
            ( ch >= 0x41 && ch <= 0x5A ) ||
            ( ch >= 0x30 && ch <= 0x39 ) ||
            ch === 0x5F || ch === 0x24
        ) pos++;
        else break;
    }
    return text.substring( start, pos );
}

/** the top-level statements of `text`, scanned as pebble's `run()` scans them */
export function topLevelStatements( text: string ): { start: number; end: number; isDecl: boolean }[]
{
    const len = text.length;
    const ranges: { start: number; end: number; isDecl: boolean }[] = [];
    let pos = 0;

    while( pos < len )
    {
        while( pos < len && isWhitespace( text.charCodeAt( pos ) ) ) pos++;
        if( pos >= len ) break;

        const stmtStart = pos;
        const isDecl = DECL_KEYWORDS.has( readWord( text, pos ) );

        let braceDepth = 0;
        let parenDepth = 0;
        let ended = false;

        while( pos < len && !ended )
        {
            const ch = text.charCodeAt( pos );

            if( ch === 0x2F && pos + 1 < len && text.charCodeAt( pos + 1 ) === 0x2F )
            {
                pos += 2;
                while( pos < len && text.charCodeAt( pos ) !== 0x0A ) pos++;
                continue;
            }
            if( ch === 0x2F && pos + 1 < len && text.charCodeAt( pos + 1 ) === 0x2A )
            {
                pos += 2;
                while( pos < len && !( text.charCodeAt( pos ) === 0x2A && pos + 1 < len && text.charCodeAt( pos + 1 ) === 0x2F ) ) pos++;
                pos += 2;
                continue;
            }
            if( ch === 0x22 || ch === 0x27 || ch === 0x60 )
            {
                pos++;
                while( pos < len )
                {
                    const sc = text.charCodeAt( pos );
                    if( sc === 0x5C ) { pos += 2; continue; }
                    if( sc === ch ) { pos++; break; }
                    pos++;
                }
                continue;
            }

            if( ch === 0x28 ) { parenDepth++; pos++; }
            else if( ch === 0x29 ) { parenDepth--; pos++; }
            else if( ch === 0x7B ) { braceDepth++; pos++; }
            else if( ch === 0x7D )
            {
                braceDepth--;
                pos++;
                if( braceDepth <= 0 && parenDepth <= 0 )
                {
                    let p2 = pos;
                    while( p2 < len && isWhitespace( text.charCodeAt( p2 ) ) ) p2++;
                    if( readWord( text, p2 ) === "from" )
                    {
                        pos = p2 + 4;
                        continue;
                    }
                    if( p2 < len && text.charCodeAt( p2 ) === 0x3B ) pos = p2 + 1;
                    ended = true;
                }
            }
            else if( ch === 0x3B && braceDepth === 0 && parenDepth === 0 )
            {
                pos++;
                ended = true;
            }
            else pos++;
        }

        const stmtEnd = Math.min( pos, len );
        if( stmtEnd > stmtStart ) ranges.push({ start: stmtStart, end: stmtEnd, isDecl });
    }
    return ranges;
}

function uniqueName( base: string, text: string ): string
{
    let name = base;
    let i = 0;
    while( text.includes( name ) ) name = base + "_" + ( i++ );
    return name;
}

function makeMapped( text: string, segments: Segment[] ): MappedSource
{
    const byGen = segments.slice().sort( ( a, b ) => a.gen - b.gen );
    const byOrig = segments.slice().sort( ( a, b ) => a.orig - b.orig );
    return {
        text,
        segments,
        toOriginal( gen )
        {
            for( const s of byGen )
                if( gen >= s.gen && gen <= s.gen + s.len ) return s.orig + ( gen - s.gen );
            return undefined;
        },
        toOriginalNearest( gen )
        {
            let best = 0;
            let bestDist = Infinity;
            for( const s of byGen )
            {
                if( gen >= s.gen && gen <= s.gen + s.len ) return s.orig + ( gen - s.gen );
                const d = gen < s.gen ? s.gen - gen : gen - ( s.gen + s.len );
                if( d < bestDist ) { bestDist = d; best = gen < s.gen ? s.orig : s.orig + s.len; }
            }
            return best;
        },
        toGenerated( orig )
        {
            for( const s of byOrig )
                if( orig >= s.orig && orig <= s.orig + s.len ) return s.gen + ( orig - s.orig );
            return undefined;
        },
    };
}

/** the text as it is: a file of declarations */
export function identitySource( text: string ): MappedSource
{
    return makeMapped( text, [ { orig: 0, gen: 0, len: text.length } ] );
}

/** the text as `Compiler.run()` compiles it */
export function wrapScript( text: string ): MappedSource
{
    const ranges = topLevelStatements( text );
    if( ranges.every( r => r.isDecl ) ) return identitySource( text );

    const funcName = uniqueName( "__pebble_run__", text );
    const segments: Segment[] = [];
    let out = "";
    const decls = ranges.filter( r => r.isDecl );
    const body = ranges.filter( r => !r.isDecl );

    decls.forEach( ( r, i ) => {
        if( i > 0 ) out += "\n";
        segments.push({ orig: r.start, gen: out.length, len: r.end - r.start });
        out += text.substring( r.start, r.end );
    });
    if( decls.length > 0 ) out += "\n";
    out += "function " + funcName + "(): void {\n";
    body.forEach( ( r, i ) => {
        if( i > 0 ) out += "\n";
        segments.push({ orig: r.start, gen: out.length, len: r.end - r.start });
        out += text.substring( r.start, r.end );
    });
    out += "\n}\n";

    return makeMapped( out, segments );
}
