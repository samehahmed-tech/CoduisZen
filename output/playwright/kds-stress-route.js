async (page) => {
  await page.unroute("**/api/kds*").catch(() => {});
  await page.unroute("http://127.0.0.1:3004/api/kds*").catch(() => {});
  const apiPattern = /^http:\/\/127\.0\.0\.1:3004\/api\/kds(?:[/?].*)?$/;
  await page.unroute(apiPattern).catch(() => {});

  const branchId = "test-branch-22c8a916";
  const stations = ["GRILL", "FRY", "BAR", "DESSERT"];
  const statuses = ["PENDING", "PREPARING", "READY"];
  const now = Date.now();
  const tickets = Array.from({ length: 60 }, (_, ticketIndex) => ({
    id: `stress-ticket-${ticketIndex + 1}`,
    branchId,
    orderId: `stress-order-${ticketIndex + 1}`,
    orderNumber: 7000 + ticketIndex,
    type: ticketIndex % 3 === 0 ? "DINE_IN" : "TAKEAWAY",
    tableName: ticketIndex % 3 === 0 ? `ترابيزة ${ticketIndex + 1}` : null,
    kitchenNotes: ticketIndex % 7 === 0 ? "بدون بصل - ملاحظة طويلة لاختبار القراءة في المطبخ" : null,
    routingStation: stations[ticketIndex % stations.length],
    status: statuses[ticketIndex % statuses.length],
    priority: ticketIndex % 11 === 0 ? "RUSH" : "NORMAL",
    createdAt: new Date(now - (ticketIndex + 1) * 60_000).toISOString(),
    bumpedAt: null,
    items: Array.from({ length: 3 + (ticketIndex % 4) }, (_, itemIndex) => ({
      id: (ticketIndex + 1) * 100 + itemIndex,
      kdsTicketId: `stress-ticket-${ticketIndex + 1}`,
      itemName: `صنف مطبخ طويل ${itemIndex + 1}`,
      quantity: 1 + (itemIndex % 3),
      modifiersText: itemIndex % 2 ? "إضافة جبنة، بدون صوص، تسوية كاملة" : null,
      isBumped: itemIndex === 0 && ticketIndex % 5 === 0,
    })),
  }));

  await page.route(apiPattern, async (route) => {
    const body = route.request().method() === "GET" ? tickets : { success: true };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  return tickets.length;
}
