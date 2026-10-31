/**
 * Runtime compatibility methods installed in server/db/index.ts.
 * Drizzle's MSSQL builders expose TOP/OUTPUT before terminal builder methods;
 * the application keeps a compatibility layer for legacy query shapes.
 */
import type { JoinNullability } from 'drizzle-orm/joins';
import type { ColumnsSelection, SelectMode, SelectResult, BuildSubquerySelection } from 'drizzle-orm/query-builders/select.types';
import type { PreparedQueryHKTBase, QueryResultHKT } from 'drizzle-orm/mssql-core/session';
import type { MsSqlSelectHKTBase } from 'drizzle-orm/mssql-core/query-builders/select.types';
import type { MsSqlTable } from 'drizzle-orm/mssql-core/table';

declare module 'drizzle-orm/mssql-core/query-builders/select' {
  interface MsSqlSelectQueryBuilderBase<
    THKT extends MsSqlSelectHKTBase,
    TTableName extends string | undefined,
    TSelection extends ColumnsSelection,
    TSelectMode extends SelectMode,
    TPreparedQueryHKT extends PreparedQueryHKTBase,
    TBranch extends 'from' | 'top',
    TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'> : {},
    TDynamic extends boolean = false,
    TExcludedMethods extends string = 'offset' | 'fetch',
    TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
    TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>
  > {
    top(value: number): any;
    limit(value: number): any;
  }
}

declare module 'drizzle-orm/mssql-core/query-builders/insert' {
  interface MsSqlInsertBase<
    TTable extends MsSqlTable,
    TQueryResult extends QueryResultHKT,
    TPreparedQueryHKT extends PreparedQueryHKTBase,
    TOutput extends Record<string, unknown> | undefined = undefined,
    TDynamic extends boolean = false,
    TExcludedMethods extends string = never
  > {
    output(fields?: any): any;
    onConflictDoNothing(): any;
    returning(fields?: any): any;
  }
}

declare module 'drizzle-orm/mssql-core/query-builders/update' {
  interface MsSqlUpdateBase<
    TTable extends MsSqlTable,
    TQueryResult extends QueryResultHKT,
    TPreparedQueryHKT extends PreparedQueryHKTBase,
    TOutput extends Record<string, unknown> | undefined = undefined,
    TDynamic extends boolean = false,
    TExcludedMethods extends string = never
  > {
    returning(fields?: any): any;
  }
}

declare module 'drizzle-orm/mssql-core/query-builders/delete' {
  interface MsSqlDeleteBase<
    TTable extends MsSqlTable,
    TQueryResult extends QueryResultHKT,
    TPreparedQueryHKT extends PreparedQueryHKTBase,
    TOutput extends Record<string, unknown> | undefined = undefined,
    TDynamic extends boolean = false,
    TExcludedMethods extends string = never
  > {
    returning(fields?: any): any;
  }
}

export {};
