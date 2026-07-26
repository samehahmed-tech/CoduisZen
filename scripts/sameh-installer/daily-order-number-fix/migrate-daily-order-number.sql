SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.orders', 'daily_order_number') IS NULL
    ALTER TABLE dbo.orders ADD daily_order_number int NULL;

EXEC sys.sp_executesql N'
    ;WITH ranked_orders AS (
        SELECT
            id,
            ROW_NUMBER() OVER (
                PARTITION BY branch_id, COALESCE(NULLIF(CONVERT(nvarchar(10), business_date), ''''), CONVERT(nvarchar(10), created_at, 23))
                ORDER BY order_number, id
            ) AS daily_number
        FROM dbo.orders
    )
    UPDATE target
    SET daily_order_number = CONVERT(int, ranked.daily_number)
    FROM dbo.orders AS target
    INNER JOIN ranked_orders AS ranked ON ranked.id = target.id
    WHERE target.daily_order_number IS NULL;
';

COMMIT TRANSACTION;
