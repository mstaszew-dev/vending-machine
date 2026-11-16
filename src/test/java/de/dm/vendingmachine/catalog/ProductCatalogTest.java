package de.dm.vendingmachine.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Guarantees of the fixed product master data the machine sells. */
class ProductCatalogTest {

    private final ProductCatalog catalog = new ProductCatalog();

    @Test
    @DisplayName("the assortment is exactly the eight products of the task, in task order")
    void findAllReturnsTheEightProductsOfTheTask() {
        List<Product> products = catalog.findAll();

        assertThat(products).hasSize(8);
        assertThat(products).extracting(Product::id)
                .containsExactly(1L, 2L, 3L, 4L, 5L, 6L, 7L, 8L);
        assertThat(products).extracting(Product::price).allSatisfy(
                price -> assertThat(price).isPositive().hasScaleOf(2));
    }

    @Test
    void pricesAreTwoDecimalEuroAmounts() {
        assertThat(catalog.find(ProductCatalog.SHOWER_GEL))
                .hasValueSatisfying(product ->
                        assertThat(product.price()).isEqualByComparingTo(new BigDecimal("0.55")));
    }

    @Test
    @DisplayName("lookup is id based and tolerates unknown ids")
    void unknownProductsAreEmptyNotAnError() {
        assertThat(catalog.find(1L)).isPresent();
        assertThat(catalog.find(99L)).isEmpty();
    }

    @Test
    @DisplayName("two lookups return equal master data, so nobody can mutate the catalog in place")
    void productsAreImmutableValueObjects() {
        Product first = catalog.find(ProductCatalog.SHOWER_GEL).orElseThrow();
        Product second = catalog.find(ProductCatalog.SHOWER_GEL).orElseThrow();

        assertThat(first).isEqualTo(second);
        assertThat(first.price()).isSameAs(second.price());
    }

    @Test
    @DisplayName("the returned list cannot be used to modify the catalog")
    void findAllIsDefensivelyCopied() {
        List<Product> products = catalog.findAll();

        assertThat(products).isUnmodifiable();
        assertThat(catalog.findAll()).hasSize(8);
    }
}
