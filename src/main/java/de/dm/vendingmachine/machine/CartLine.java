package de.dm.vendingmachine.machine;

/**
 * One requested position of a purchase or refill: which product and how many units.
 */
public record CartLine(long productId, int quantity) {
}
