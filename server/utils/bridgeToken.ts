/** Attendance bridge has its own credential; it must never inherit a print token. */
export const getAttendanceBridgeToken = () => String(process.env.ATTENDANCE_BRIDGE_TOKEN || '').trim();

export default getAttendanceBridgeToken;
