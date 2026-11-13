package de.dm.vendingmachine.machine;

import java.math.BigDecimal;

/**
 * A successfully purchased position, including the price that was actually charged.
 */
public record PurchasedItem(
        long productId,
        String name,
        int quantity,
        BigDecimal unitPrice,
        BigDecimal lineTotal) {
}
