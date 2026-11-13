package de.dm.vendingmachine.api;

import java.math.BigDecimal;

/** Coins the machine pays back before or instead of a purchase. */
public record ReturnedCreditResponse(BigDecimal returned) {
}
