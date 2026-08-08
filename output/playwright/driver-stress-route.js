async (page) => {
  const ordersPattern = /^http:\/\/127\.0\.0\.1:3004\/api\/orders(?:[/?].*)?$/;
  await page.unroute(ordersPattern).catch(() => {});
  const now = Date.now();
  const orders = [
    {
      id: "driver-ready-1",
      orderNumber: 8101,
      driverId: "u-admin",
      status: "READY",
      total: 425.5,
      paymentMethod: "CASH",
      customerPhone: "01000000000",
      customerAddress: "١٢٣ شارع طويل جدًا، الدور الخامس، شقة ١٢، بجوار علامة واضحة",
      deliveryLat: 30.0626,
      deliveryLng: 31.2497,
      createdAt: new Date(now - 22 * 60_000).toISOString(),
    },
    {
      id: "driver-road-2",
      orderNumber: 8102,
      driverId: "u-admin",
      status: "OUT_FOR_DELIVERY",
      total: 780,
      paymentMethod: "CASH",
      customerPhone: "01111111111",
      customerAddress: "٥٠ شارع النيل، مدخل جانبي بعد الصيدلية",
      deliveryLat: 30.0511,
      deliveryLng: 31.2289,
      createdAt: new Date(now - 58 * 60_000).toISOString(),
    },
    {
      id: "driver-prepaid-3",
      orderNumber: 8103,
      driverId: "u-admin",
      status: "ASSIGNED",
      total: 190,
      paymentMethod: "VISA",
      customerPhone: "01222222222",
      customerAddress: "ميدان التحرير، مبنى ٧",
      deliveryLat: 30.0444,
      deliveryLng: 31.2357,
      createdAt: new Date(now - 8 * 60_000).toISOString(),
    },
  ];

  await page.route(ordersPattern, async (route) => {
    const body = route.request().method() === "GET" ? orders : { success: true };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  return orders.length;
}
