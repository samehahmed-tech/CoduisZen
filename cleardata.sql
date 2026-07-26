/*
    RestoFlow ERP - SQL Server data reset

    This script deletes data only; it does not drop tables or change the schema.

    Before running:
      1. Take a database backup.
      2. Select the intended RestoFlow database in SSMS.
      3. Change @Confirm to N'YES'.

    @PreserveSecurity = 1 keeps login/security foundation so the system remains
    accessible: users, roles, permission_definitions, and Drizzle migration history.
    Set it to 0 only when you intentionally want every user table emptied.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Confirm nvarchar(3) = N'NO';
DECLARE @PreserveSecurity bit = 1;

IF UPPER(@Confirm) <> N'YES'
    THROW 50001, N'Clear cancelled. Set @Confirm to YES after taking a backup.', 1;

DECLARE @Tables TABLE
(
    RowId int IDENTITY(1,1) PRIMARY KEY,
    SchemaName sysname NOT NULL,
    TableName sysname NOT NULL
);

INSERT INTO @Tables (SchemaName, TableName)
SELECT s.name, t.name
FROM sys.tables AS t
JOIN sys.schemas AS s ON s.schema_id = t.schema_id
WHERE t.is_ms_shipped = 0
  AND NOT (
      @PreserveSecurity = 1
      AND t.name IN (N'users', N'roles', N'permission_definitions', N'__drizzle_migrations')
  );

DECLARE @RowId int = 1;
DECLARE @MaxRowId int = COALESCE((SELECT MAX(RowId) FROM @Tables), 0);
DECLARE @SchemaName sysname;
DECLARE @TableName sysname;
DECLARE @QualifiedName nvarchar(517);
DECLARE @Sql nvarchar(max);

BEGIN TRY
    BEGIN TRANSACTION;

    -- Foreign keys are disabled temporarily so all selected tables can be cleared.
    WHILE @RowId <= @MaxRowId
    BEGIN
        SELECT @SchemaName = SchemaName, @TableName = TableName
        FROM @Tables WHERE RowId = @RowId;

        SET @QualifiedName = QUOTENAME(@SchemaName) + N'.' + QUOTENAME(@TableName);
        SET @Sql = N'ALTER TABLE ' + @QualifiedName + N' NOCHECK CONSTRAINT ALL;';
        EXEC sys.sp_executesql @Sql;
        SET @RowId += 1;
    END;

    SET @RowId = 1;
    WHILE @RowId <= @MaxRowId
    BEGIN
        SELECT @SchemaName = SchemaName, @TableName = TableName
        FROM @Tables WHERE RowId = @RowId;

        SET @QualifiedName = QUOTENAME(@SchemaName) + N'.' + QUOTENAME(@TableName);
        SET @Sql = N'DELETE FROM ' + @QualifiedName + N';';
        EXEC sys.sp_executesql @Sql;

        IF EXISTS
        (
            SELECT 1
            FROM sys.identity_columns AS ic
            JOIN sys.tables AS t ON t.object_id = ic.object_id
            JOIN sys.schemas AS s ON s.schema_id = t.schema_id
            WHERE s.name = @SchemaName AND t.name = @TableName
        )
        BEGIN
            SET @Sql = N'DBCC CHECKIDENT (' + QUOTENAME(@QualifiedName, '''') + N', RESEED, 0) WITH NO_INFOMSGS;';
            EXEC sys.sp_executesql @Sql;
        END;

        SET @RowId += 1;
    END;

    SET @RowId = 1;
    WHILE @RowId <= @MaxRowId
    BEGIN
        SELECT @SchemaName = SchemaName, @TableName = TableName
        FROM @Tables WHERE RowId = @RowId;

        SET @QualifiedName = QUOTENAME(@SchemaName) + N'.' + QUOTENAME(@TableName);
        SET @Sql = N'ALTER TABLE ' + @QualifiedName + N' WITH CHECK CHECK CONSTRAINT ALL;';
        EXEC sys.sp_executesql @Sql;
        SET @RowId += 1;
    END;

    COMMIT TRANSACTION;

    SELECT COUNT(*) AS ClearedTableCount,
           CASE WHEN @PreserveSecurity = 1
                THEN N'Data cleared; login/security tables preserved.'
                ELSE N'All user-table data cleared.'
           END AS Result;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
