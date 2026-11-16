package de.dm.vendingmachine.catalog;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;

/**
 * Immutable product master data. Prices always carry two decimal places and are never
 * negative, so summing them stays exact and the API cannot emit odd scales like 0.550.
 */
public record Product(long id, String name, ProductGroup group, BigDecimal price) {

    public Product {
        Objects.requireNonNull(name, "name must not be null");
        Objects.requireNonNull(group, "group must not be null");
        Objects.requireNonNull(price, "price must not be null");
        if (id <= 0) {
            throw new IllegalArgumentException("id must be positive");
        }
        if (price.signum() < 0) {
            throw new IllegalArgumentException("price must not be negative");
        }
        price = price.setScale(2, RoundingMode.UNNECESSARY);
    }
}
