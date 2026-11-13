package de.dm.vendingmachine.catalog;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Optional;

/**
 * Euro coins the machine accepts. Notes are deliberately not supported: the task's
 * prices are all below 16 EUR, so coins keep the change calculation simple.
 */
public enum Coin {

    FIVE_CENTS(new BigDecimal("0.05")),
    TEN_CENTS(new BigDecimal("0.10")),
    TWENTY_CENTS(new BigDecimal("0.20")),
    FIFTY_CENTS(new BigDecimal("0.50")),
    ONE_EURO(new BigDecimal("1.00")),
    TWO_EUROS(new BigDecimal("2.00"));

    private final BigDecimal value;

    Coin(BigDecimal value) {
        this.value = value;
    }

    public BigDecimal value() {
        return value;
    }

    /**
     * @return the coin matching the given amount, or empty for any amount that is not
     *         a valid coin (e.g. 0.03 or 5.00). The comparison ignores the scale, so
     *         {@code 0.5} and {@code 0.50} both match the 50 cent coin.
     */
    public static Optional<Coin> of(BigDecimal amount) {
        if (amount == null) {
            return Optional.empty();
        }
        return Arrays.stream(values())
                .filter(coin -> coin.value.compareTo(amount) == 0)
                .findFirst();
    }
}
