// build.mjs bundles .css as a plain string (esbuild `text` loader).
declare module '*.css' {
  const css: string;
  export default css;
}
