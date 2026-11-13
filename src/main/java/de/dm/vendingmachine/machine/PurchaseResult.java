package de.dm.vendingmachine.machine;

import java.math.BigDecimal;
import java.util.List;

/**
 * Result of a checkout. The machine keeps no credit afterwards, so {@code change} is
 * always the full remaining credit and the new credit is zero.
 */
public record PurchaseResult(
        BigDecimal total,
        BigDecimal change,
        List<PurchasedItem> items,
        BigDecimal remainingCredit) {
}
