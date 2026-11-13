package de.dm.vendingmachine.api;

import jakarta.validation.constraints.Positive;

/** One position of a cart or refill: product id and number of units. */
public record CartItemRequest(@Positive long productId, @Positive int quantity) {
}
