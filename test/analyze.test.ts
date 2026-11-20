// The editor's answers, from the compiler's check(), on the texts the documentation shows.
// Run with `npm test` (node --test through tsx).
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, membersAfterDot } from "../src/language/analyze";
import { wrapScript, identitySource } from "../src/language/scriptWrap";

const at = ( text: string, needle: string, delta = 0 ): number => {
    const i = text.indexOf( needle );
    assert.ok( i >= 0, `'${needle}' not in the text` );
    return i + delta;
};

const contract = `struct Owner { pkh: bytes }

function inc( x: int ): int { return x + 1; }

contract C {
    spend s( r: int ) {
        const { tx } = context;
        const y = inc( r );
        assert tx.requiredSigners.includes( #00 );
        assert y > 0;
    }
}
`;

test( "a file without errors has no diagnostics", async () => {
    const a = await analyze( contract );
    assert.deepEqual( a.diagnostics, [] );
});

test( "a type error is reported where it is", async () => {
    const text = `contract C {\n    spend s() {\n        const x: int = #00;\n    }\n}\n`;
    const a = await analyze( text );
    assert.equal( a.diagnostics.length, 1 );
    const d = a.diagnostics[0];
    assert.equal( d.severity, "error" );
    assert.equal( d.code, 2322 );
    assert.equal( text.slice( d.start, d.end ), "#00" );
});

test( "a warning is a warning", async () => {
    const text = `function check( x: int ): int { assert x > 0; return x; }
contract C {
    spend s( r: int ) {
        const ok = check( r );
    }
}
`;
    const a = await analyze( text );
    assert.ok( a.diagnostics.some( d => d.severity === "warning" ), JSON.stringify( a.diagnostics ) );
    assert.ok( !a.diagnostics.some( d => d.severity === "error" ), JSON.stringify( a.diagnostics ) );
});

test( "hover: the type of a function where it is called", async () => {
    const a = await analyze( contract );
    const h = a.hoverAt( at( contract, "inc( r )", 1 ) );
    assert.ok( h, "no hover" );
    assert.match( h!.signature, /inc/ );
    assert.match( h!.signature, /\(int\) => int/ );
    assert.equal( contract.slice( h!.start, h!.end ), "inc" );
});

test( "definition and references of a function", async () => {
    const a = await analyze( contract );
    const def = a.definitionAt( at( contract, "inc( r )", 1 ) );
    assert.ok( def );
    assert.equal( def!.start, at( contract, "inc( x" ) );
    const refs = a.referencesAt( at( contract, "inc( x" ) );
    assert.deepEqual( refs.map( r => contract.slice( r.start, r.end ) ), [ "inc", "inc" ] );
});

test( "completion after a dot: the members of the value's type", async () => {
    // typed `tx.` in a statement that is not complete yet
    const typing = contract.replace( "assert y > 0;", "assert y > 0;\n        assert tx." );
    const dot = typing.lastIndexOf( "tx." ) + 2;
    const names = ( await membersAfterDot( typing, dot ) ).map( c => c.label );
    for( const f of [ "inputs", "outputs", "fee", "requiredSigners" ] ) assert.ok( names.includes( f ), names.join( " " ) );
    // a member of a member, in a statement that type-checks without the dot
    const chained = contract.replace( "assert y > 0;", "assert y > 0;\n        const v = tx.validityInterval.fr" );
    const dot2 = chained.lastIndexOf( ".fr" );
    const names2 = ( await membersAfterDot( chained, dot2 ) ).map( c => c.label );
    assert.ok( names2.includes( "from" ) && names2.includes( "to" ), names2.join( " " ) );
});

test( "completion of names: what is visible there, then the keywords", async () => {
    const a = await analyze( contract );
    const items = a.namesAt( at( contract, "assert y" ) );
    const labels = items.map( c => c.label );
    for( const n of [ "y", "tx", "r", "inc", "Owner", "C" ] ) assert.ok( labels.includes( n ), labels.join( " " ) );
    assert.equal( items.find( c => c.label === "inc" )!.kind, "function" );
    assert.ok( labels.includes( "assert" ) );
});

// ---- script mode: top-level statements, as Compiler.run() takes them

const script = `const supply: int = 1_000_000;
let   spent:  int = 500;

function half( n: int ): int { return n / 2; }

const left = supply - spent;
assert half( left ) >= 0 else "underflow";`;

test( "script: wrapped as run() wraps it, every statement mapped back", () => {
    const m = wrapScript( script );
    assert.match( m.text, /^function half[\s\S]*function __pebble_run__\(\): void \{/ );
    for( const needle of [ "supply", "spent", "half( left )", "\"underflow\"" ] )
    {
        const orig = at( script, needle );
        const gen = m.toGenerated( orig );
        assert.ok( gen !== undefined, needle );
        assert.equal( m.text.slice( gen!, gen! + needle.length ), needle );
        assert.equal( m.toOriginal( gen! ), orig );
    }
    // a file of declarations only is not wrapped
    assert.equal( wrapScript( "function f(): int { return 1; }" ).text, "function f(): int { return 1; }" );
    assert.equal( identitySource( "x" ).toGenerated( 1 ), 1 );
});

test( "script: no diagnostics on a valid snippet; hover and definition across the wrapper", async () => {
    const a = await analyze( script, { mode: "script" } );
    assert.deepEqual( a.diagnostics, [] );
    const h = a.hoverAt( at( script, "half( left )", 1 ) );
    assert.ok( h );
    assert.match( h!.signature, /\(int\) => int/ );
    assert.equal( script.slice( h!.start, h!.end ), "half" );
    const def = a.definitionAt( at( script, "half( left )" ) );
    assert.equal( def!.start, at( script, "half( n" ) );
    const refs = a.referencesAt( at( script, "spent;" ) - 0 );
    assert.ok( refs.length >= 1 );
});

test( "script: an error is reported at its place in the snippet", async () => {
    const text = `const a: int = 1;\nconst b: int = #ff;\nassert a > 0;`;
    const a = await analyze( text, { mode: "script" } );
    const errors = a.diagnostics.filter( d => d.severity === "error" );
    assert.equal( errors.length, 1, JSON.stringify( a.diagnostics ) );
    assert.equal( text.slice( errors[0].start, errors[0].end ), "#ff" );
});

test( "the same snippet in file mode is an error (top-level statements)", async () => {
    const a = await analyze( script );
    assert.ok( a.diagnostics.some( d => d.severity === "error" ) );
});

test( "imports from the other files of the project", async () => {
    const lib = `export function double( n: int ): int { return n * 2; }\n`;
    const main = `import { double } from "./lib.pebble";\ncontract C {\n    spend s( r: int ) {\n        assert double( r ) > 0;\n    }\n}\n`;
    const a = await analyze( main, { files: { "lib.pebble": lib } } );
    assert.deepEqual( a.diagnostics, [] );
    const h = a.hoverAt( at( main, "double( r )", 1 ) );
    assert.ok( h );
    assert.match( h!.signature, /\(int\) => int/ );
});
