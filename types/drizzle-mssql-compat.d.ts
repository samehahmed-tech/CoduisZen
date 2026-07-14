import type { BuildSubquerySelection, JoinNullability, SelectMode, SelectResult } from 'drizzle-orm/query-builders/select.types';
import type { ColumnsSelection } from 'drizzle-orm/sql/sql';
import type { PreparedQueryHKTBase } from 'drizzle-orm/mssql-core/session';
import type { QueryResultHKT } from 'drizzle-orm/session';
import type { MsSqlTable } from 'drizzle-orm/mssql-core/table';

declare module 'drizzle-orm/mssql-core/query-builders/select' {
  interface MsSqlSelectBase<
    TTableName extends string | undefined,
    TSelection,
    TSelectMode extends SelectMode,
    TPreparedQueryHKT extends PreparedQueryHKTBase,
    TBranch extends 'from' | 'top',
    TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'> : {},
    TDynamic extends boolean = false,
    TExcludedMethods extends string = 'offset' | 'fetch',
    TResult = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
    TSelectedFields = BuildSubquerySelection<TSelection, TNullabilityMap>,
  > {
    limit(top: number): this;
    top(top: number): this;
  }

  interface MsSqlSelectQueryBuilderBase<
    THKT,
    TTableName extends string | undefined,
    TSelection extends ColumnsSelection,
    TSelectMode extends SelectMode,
    TPreparedQueryHKT extends PreparedQueryHKTBase,
    TBranch extends 'from' | 'top',
    TNullabilityMap extends Record<string, JoinNullability> = TTableName extends string ? Record<TTableName, 'not-null'> : {},
    TDynamic extends boolean = false,
    TExcludedMethods extends string = 'offset' | 'fetch',
    TResult extends any[] = SelectResult<TSelection, TSelectMode, TNullabilityMap>[],
    TSelectedFields extends ColumnsSelection = BuildSubquerySelection<TSelection, TNullabilityMap>,
  > {
    limit(top: number): this;
    top(top: number): this;
  }
}

declare module 'drizzle-orm/mssql-core/query-builders/insert' {
  interface MsSqlInsertBase<
    TTable extends MsSqlTable,
    TQueryResult extends QueryResultHKT,
    TPreparedQueryHKT extends PreparedQueryHKTBase,
    TOutput extends Record<string, unknown> | undefined = undefined,
    TDynamic extends boolean = false,
    TExcludedMethods extends string = never,
  > {
    output(fields?: any): any;
    returning(fields?: any): any;
    onConflictDoNothing(config?: any): this;
  }
}

declare module 'drizzle-orm/mssql-core/query-builders/update' {
  interface MsSqlUpdateBase<
    TTable extends MsSqlTable,
    TQueryResult extends QueryResultHKT,
    TPreparedQueryHKT extends PreparedQueryHKTBase,
    TOutput extends Record<string, unknown> | undefined = undefined,
    TDynamic extends boolean = false,
    TExcludedMethods extends string = never,
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
    TExcludedMethods extends string = never,
  > {
    returning(fields?: any): any;
  }
}
