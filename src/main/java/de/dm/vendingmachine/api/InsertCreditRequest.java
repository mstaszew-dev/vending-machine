package de.dm.vendingmachine.api;

import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

/**
 * One coin the customer pushes into the machine, e.g. {@code {"amount": 0.50}}.
 * Only "not null" is validated here: which amounts are real coins is a machine rule,
 * so the domain answers with {@code INVALID_COIN} including the accepted denominations.
 */
public record InsertCreditRequest(@NotNull BigDecimal amount) {
}
