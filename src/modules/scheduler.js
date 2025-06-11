function scheduleTasks({
  calculateAndEmitPrices,
  cleanupOldKeyPrices,
  checkKeyPriceStability,
  updateMovingAverages,
  db,
  pgp,
}) {
  setInterval(calculateAndEmitPrices, 15 * 60 * 1000);
  setInterval(() => cleanupOldKeyPrices(db), 30 * 60 * 1000);
  setInterval(checkKeyPriceStability, 30 * 60 * 1000);
  setInterval(() => updateMovingAverages(db, pgp), 15 * 60 * 1000);
}

module.exports = scheduleTasks;
