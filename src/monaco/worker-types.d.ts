/* Worker module declarations for Vite ?worker imports used by Monaco */
declare module 'monaco-editor/esm/vs/editor/editor.worker?worker' {
  const WorkerFactory: { new (): Worker };
  export default WorkerFactory;
}

declare module 'monaco-editor/esm/vs/language/typescript/ts.worker?worker' {
  const WorkerFactory: { new (): Worker };
  export default WorkerFactory;
}

declare module 'monaco-editor/esm/vs/language/json/json.worker?worker' {
  const WorkerFactory: { new (): Worker };
  export default WorkerFactory;
}

declare module 'monaco-editor/esm/vs/language/css/css.worker?worker' {
  const WorkerFactory: { new (): Worker };
  export default WorkerFactory;
}

declare module 'monaco-editor/esm/vs/language/html/html.worker?worker' {
  const WorkerFactory: { new (): Worker };
  export default WorkerFactory;
}