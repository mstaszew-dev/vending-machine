package de.dm.vendingmachine.catalog;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;
import org.springframework.stereotype.Component;

/**
 * The eight products the dm drugstore vending machine is allowed to sell.
 * Fixed master data, therefore a static read-only map instead of a persistence layer.
 */
@Component
public class ProductCatalog {

    public static final long SHOWER_GEL = 1L;
    public static final long BEARD_OIL = 2L;
    public static final long BODY_LOTION = 3L;
    public static final long USB_STICK = 4L;
    public static final long NIGHT_CREAM = 5L;
    public static final long KINDERHOSE = 6L;
    public static final long CLEANER = 7L;
    public static final long DIRT_ERASER = 8L;

    private static final Map<Long, Product> PRODUCTS = Stream.of(
                    new Product(SHOWER_GEL, "Balea shower gel", ProductGroup.PERSONAL_HYGIENE, new BigDecimal("0.55")),
                    new Product(BEARD_OIL, "SEINZ beard oil", ProductGroup.FACE, new BigDecimal("7.95")),
                    new Product(BODY_LOTION, "Balea body lotion", ProductGroup.PERSONAL_HYGIENE, new BigDecimal("0.75")),
                    new Product(USB_STICK, "Fotoparadies USB stick 16GB", ProductGroup.PHOTO, new BigDecimal("6.95")),
                    new Product(NIGHT_CREAM, "Nivea night cream Q10", ProductGroup.FACE, new BigDecimal("15.95")),
                    new Product(KINDERHOSE, "Kinderhose (one-size)", ProductGroup.TEXTILE, new BigDecimal("9.90")),
                    new Product(CLEANER, "All-purpose cleaner Power degreaser", ProductGroup.HOUSEHOLD, new BigDecimal("1.75")),
                    new Product(DIRT_ERASER, "Profissimo Dirt eraser", ProductGroup.HOUSEHOLD, new BigDecimal("2.25")))
            .collect(LinkedHashMap::new, (map, product) -> map.put(product.id(), product), Map::putAll);

    public List<Product> findAll() {
        return List.copyOf(PRODUCTS.values());
    }

    public Optional<Product> find(long id) {
        return Optional.ofNullable(PRODUCTS.get(id));
    }
}
