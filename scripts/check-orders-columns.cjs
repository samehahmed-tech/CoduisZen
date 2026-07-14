const mssql = require('mssql');
const config = {
    connectionString: 'Driver={ODBC Driver 18 for SQL Server};Server=(localdb)\\CoduisZen;Database=CoduisZen;Trusted_Connection=Yes;Encrypt=No;',
    server: '(localdb)\\CoduisZen'
};

async function test() {
    const pool = new mssql.ConnectionPool(config);
    await pool.connect();
    const result = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'orders' ORDER BY ORDINAL_POSITION");
    const cols = result.recordset.map(r => r.COLUMN_NAME);
    console.log('Orders columns:', cols.join(', '));
    console.log('Total:', cols.length);
    console.log('Has delivery_lat:', cols.includes('delivery_lat'));
    console.log('Has delivery_lng:', cols.includes('delivery_lng'));
    console.log('Has delivery_address_id:', cols.includes('delivery_address_id'));
    console.log('Has estimated_delivery_time:', cols.includes('estimated_delivery_time'));
    console.log('Has actual_delivery_time:', cols.includes('actual_delivery_time'));
    console.log('Has cancelled_at:', cols.includes('cancelled_at'));
    console.log('Has cancel_reason:', cols.includes('cancel_reason'));
    console.log('Has shift_id:', cols.includes('shift_id'));
    console.log('Has eta_receipt_uuid:', cols.includes('eta_receipt_uuid'));
    console.log('Has is_call_center_order:', cols.includes('is_call_center_order'));
    console.log('Has call_center_agent_id:', cols.includes('call_center_agent_id'));
    console.log('Has discount_type:', cols.includes('discount_type'));
    console.log('Has discount_reason:', cols.includes('discount_reason'));
    console.log('Has tip_amount:', cols.includes('tip_amount'));
    await pool.close();
}
test().catch(console.error);
