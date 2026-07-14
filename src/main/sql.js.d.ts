declare module 'sql.js' {
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
    (config?: Partial<SqlJsConfig>): Promise<SqlJsStatic>;
  }

  interface SqlJsConfig {
    locateFile: (file: string) => string;
  }

  interface Database {
    run(sql: string, params?: any[]): Database;
    exec(sql: string, params?: any[]): QueryExecResult[];
    prepare(sql: string): Statement;
    each(sql: string, params: any[], callback: (row: any) => void, done: () => void): void;
    each(sql: string, callback: (row: any) => void, done: () => void): void;
    export(): Uint8Array;
    close(): void;
    getRowsModified(): number;
    create_function(name: string, func: (...args: any[]) => any): void;
  }

  interface Statement {
    bind(params?: any[]): boolean;
    step(): boolean;
    get(): any[];
    getAsObject(params?: object): Record<string, unknown>;
    getColumnNames(): string[];
    getAsObject(): Record<string, unknown>;
    free(): boolean;
    reset(): void;
  }

  interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  function initSqlJs(config?: Partial<SqlJsConfig>): Promise<SqlJsStatic>;
  export default initSqlJs;
  export { SqlJsStatic, Database, Statement, QueryExecResult };
}
