package de.dm.vendingmachine.machine;

import de.dm.vendingmachine.catalog.Product;
import de.dm.vendingmachine.catalog.ProductGroup;
import java.math.BigDecimal;

/**
 * Read model of a single slot: product data plus everything that changes while the
 * machine is in use (stock, capacity, units sold).
 */
public record ProductView(
        long id,
        String name,
        ProductGroup group,
        BigDecimal price,
        int stock,
        int capacity,
        long unitsSold) {

    static ProductView of(Product product, int stock, int capacity, long unitsSold) {
        return new ProductView(
                product.id(),
                product.name(),
                product.group(),
                product.price(),
                stock,
                capacity,
                unitsSold);
    }
}
