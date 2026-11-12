const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' });
const dayKey = value => dayFormatter.format(new Date(value));
const summarize = orders => ({
  orderCount: orders.length,
  completedCount: orders.filter(o => o.status === 'COMPLETED').length,
  completedValueCents: orders.filter(o => o.status === 'COMPLETED').reduce((sum, o) => sum + Number(o.total_cents), 0)
});

export function businessInsights(db, cookId, days, now = Date.now()) {
  const start = now - days * 86400000;
  const previousStart = start - days * 86400000;
  const orders = db.prepare('SELECT status,total_cents,created_at_iso FROM orders WHERE cook_id=? AND created_at_iso>=? AND created_at_iso<=? ORDER BY created_at_iso')
    .all(cookId, new Date(previousStart).toISOString(), new Date(now).toISOString());
  const current = orders.filter(o => Date.parse(o.created_at_iso) >= start);
  const previous = orders.filter(o => Date.parse(o.created_at_iso) < start);
  const bins = new Map();
  // A rolling period can cross portions of two calendar dates at its edges.
  for (let t = start; t < now; t += 3600000) bins.set(dayKey(t), { day: dayKey(t), orders: 0, completedValueCents: 0 });
  bins.set(dayKey(now), { day: dayKey(now), orders: 0, completedValueCents: 0 });
  for (const order of current) {
    const bin = bins.get(dayKey(order.created_at_iso));
    bin.orders++;
    if (order.status === 'COMPLETED') bin.completedValueCents += Number(order.total_cents);
  }
  return {
    timeZone: 'America/Toronto', startIso: new Date(start).toISOString(), asOfIso: new Date(now).toISOString(),
    current: summarize(current), previous: summarize(previous), daily: [...bins.values()]
  };
}
