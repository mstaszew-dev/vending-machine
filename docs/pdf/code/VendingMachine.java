package de.dm.vendingmachine.machine;

import de.dm.vendingmachine.catalog.Coin;
import de.dm.vendingmachine.catalog.Product;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A single physical vending machine and the only owner of its mutable state. The class is
 * a pure domain aggregate: no Spring, no HTTP, no persistence. {@link MachineService}
 * exposes one instance as a bean.
 *
 * <p>Every public operation is {@code synchronized}. A real machine serves one customer
 * at a time, and a single monitor is the cheapest way to keep stock, credit and revenue
 * consistent: a customer can never buy units that a parallel checkout just took. If the
 * machine ever had to serve several customers concurrently, the state would move behind
 * an optimistic-locking store instead of this monitor.
 */
public class VendingMachine {

    private static final BigDecimal ZERO = new BigDecimal("0.00");

    private final Map<Long, Product> products;
    private final int capacityPerSlot;
    private final Map<Long, Integer> stock = new LinkedHashMap<>();
    private final Map<Long, Long> unitsSold = new HashMap<>();

    private BigDecimal credit = ZERO;
    private BigDecimal totalRevenue = ZERO;

    /**
     * @param products          the assortment, in display order
     * @param capacityPerSlot   how many units one slot can hold
     * @param initialStockPerSlot units filled at startup, clamped to the slot capacity
     */
    public VendingMachine(List<Product> products, int capacityPerSlot, int initialStockPerSlot) {
        if (products == null || products.isEmpty()) {
            throw new IllegalArgumentException("products must not be empty");
        }
        if (capacityPerSlot <= 0) {
            throw new IllegalArgumentException("capacityPerSlot must be positive");
        }
        this.products = new LinkedHashMap<>();
        products.forEach(product -> this.products.put(product.id(), product));
        this.capacityPerSlot = capacityPerSlot;
        int initialStock = Math.max(0, Math.min(initialStockPerSlot, capacityPerSlot));
        products.forEach(product -> {
            stock.put(product.id(), initialStock);
            unitsSold.put(product.id(), 0L);
        });
    }

    /** Current state of the machine, used by the frontend to render both views. */
    public synchronized MachineView view() {
        List<ProductView> productViews = products.values().stream()
                .map(product -> ProductView.of(
                        product,
                        stock.get(product.id()),
                        capacityPerSlot,
                        unitsSold.get(product.id())))
                .toList();
        return new MachineView(credit, productViews, acceptedCoins(), totalRevenue);
    }

    /** Accepts exactly one coin and adds it to the inserted credit. */
    public synchronized MachineView insertCoin(BigDecimal amount) {
        Coin coin = Coin.of(amount)
                .orElseThrow(() -> new MachineException(
                        MachineError.INVALID_COIN,
                        "Only these coins are accepted: " + acceptedCoins() + " EUR"));
        credit = credit.add(coin.value());
        return view();
    }

    /** Returns all inserted coins, e.g. when the customer cancels before paying. */
    public synchronized BigDecimal returnCredit() {
        BigDecimal returned = credit;
        credit = ZERO;
        return returned;
    }

    /**
     * Pays for all positions at once. Either the whole cart is sold or nothing changes:
     * stock, credit and revenue are only touched after every position has been validated.
     */
    public synchronized PurchaseResult purchase(List<CartLine> lines) {
        Map<Long, Integer> requested = normalise(lines);

        for (Map.Entry<Long, Integer> entry : requested.entrySet()) {
            Product product = product(entry.getKey());
            int available = stock.get(product.id());
            if (entry.getValue() > available) {
                throw new MachineException(
                        MachineError.INSUFFICIENT_STOCK,
                        available == 0
                                ? "'%s' is sold out".formatted(product.name())
                                : "Only %d unit(s) of '%s' left, %d requested"
                                        .formatted(available, product.name(), entry.getValue()));
            }
        }

        List<PurchasedItem> items = new ArrayList<>();
        BigDecimal total = ZERO;
        for (Map.Entry<Long, Integer> entry : requested.entrySet()) {
            Product product = product(entry.getKey());
            int quantity = entry.getValue();
            BigDecimal lineTotal = product.price().multiply(BigDecimal.valueOf(quantity));
            items.add(new PurchasedItem(product.id(), product.name(), quantity, product.price(), lineTotal));
            total = total.add(lineTotal);
        }

        if (credit.compareTo(total) < 0) {
            throw new MachineException(
                    MachineError.INSUFFICIENT_CREDIT,
                    "Credit of %s EUR is not enough for %s EUR, %s EUR missing"
                            .formatted(credit, total, total.subtract(credit)));
        }

        for (Map.Entry<Long, Integer> entry : requested.entrySet()) {
            stock.merge(entry.getKey(), -entry.getValue(), Integer::sum);
            unitsSold.merge(entry.getKey(), entry.getValue().longValue(), Long::sum);
        }
        totalRevenue = totalRevenue.add(total);

        BigDecimal change = credit.subtract(total);
        credit = ZERO;
        return new PurchaseResult(total, change, items, ZERO);
    }

    /** Staff action: tops up slots. Never exceeds the configured slot capacity. */
    public synchronized MachineView refill(List<CartLine> lines) {
        Map<Long, Integer> requested = normalise(lines);

        for (Map.Entry<Long, Integer> entry : requested.entrySet()) {
            Product product = product(entry.getKey());
            int current = stock.get(product.id());
            if (entry.getValue() > capacityPerSlot - current) {
                throw new MachineException(
                        MachineError.SLOT_CAPACITY_EXCEEDED,
                        "Slot of '%s' holds at most %d unit(s), %d already in stock, %d requested"
                                .formatted(product.name(), capacityPerSlot, current, entry.getValue()));
            }
        }

        requested.forEach((productId, quantity) -> stock.merge(productId, quantity, Integer::sum));
        return view();
    }

    private Map<Long, Integer> normalise(List<CartLine> lines) {
        if (lines == null || lines.isEmpty()) {
            throw new MachineException(MachineError.INVALID_QUANTITY, "At least one position is required");
        }
        Map<Long, Integer> requested = new LinkedHashMap<>();
        for (CartLine line : lines) {
            if (line == null) {
                throw new MachineException(MachineError.INVALID_QUANTITY, "Positions must not be null");
            }
            if (line.quantity() <= 0) {
                throw new MachineException(
                        MachineError.INVALID_QUANTITY,
                        "Quantity for product %d must be at least 1".formatted(line.productId()));
            }
            if (line.quantity() > capacityPerSlot) {
                // A slot can never hold more than its capacity, so a larger single line is
                // never buyable or stockable. Rejecting it here also keeps the merge below
                // free of integer overflow.
                throw new MachineException(
                        MachineError.INVALID_QUANTITY,
                        "At most %d unit(s) per product can be handled, %d requested"
                                .formatted(capacityPerSlot, line.quantity()));
            }
            Product product = product(line.productId());
            requested.merge(product.id(), line.quantity(), VendingMachine::addQuantities);
        }
        return requested;
    }

    private static int addQuantities(int left, int right) {
        try {
            return Math.addExact(left, right);
        } catch (ArithmeticException overflow) {
            throw new MachineException(MachineError.INVALID_QUANTITY, "Quantity is too large");
        }
    }

    private Product product(long productId) {
        Product product = products.get(productId);
        if (product == null) {
            throw new MachineException(MachineError.UNKNOWN_PRODUCT, "Unknown product id " + productId);
        }
        return product;
    }

    private static List<BigDecimal> acceptedCoins() {
        return Arrays.stream(Coin.values())
                .map(coin -> coin.value().setScale(2, RoundingMode.HALF_UP))
                .toList();
    }
}
