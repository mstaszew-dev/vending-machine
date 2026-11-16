package de.dm.vendingmachine.machine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import de.dm.vendingmachine.catalog.ProductCatalog;
import java.math.BigDecimal;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Business rules of the machine, tested without Spring so the invariants stay readable.
 */
class VendingMachineTest {

    private static final long SHOWER_GEL = ProductCatalog.SHOWER_GEL;
    private static final long NIGHT_CREAM = ProductCatalog.NIGHT_CREAM;

    private VendingMachine machine;

    @BeforeEach
    void setUp() {
        machine = new VendingMachine(new ProductCatalog().findAll(), 10, 3);
    }

    @Test
    @DisplayName("a fresh machine holds eight products, three units each and no credit")
    void freshMachineIsStocked() {
        MachineView view = machine.view();

        assertThat(view.products()).hasSize(8);
        assertThat(view.products()).allSatisfy(product -> assertThat(product.stock()).isEqualTo(3));
        assertThat(view.credit()).isEqualByComparingTo("0.00");
        assertThat(view.totalRevenue()).isEqualByComparingTo("0.00");
        assertThat(view.acceptedCoins()).hasSize(6);
        assertThat(view.products().getFirst().price()).isEqualByComparingTo("0.55");
    }

    @Test
    void acceptsCoinsAndSumsThemUpAsCredit() {
        machine.insertCoin(new BigDecimal("0.50"));
        machine.insertCoin(new BigDecimal("2.00"));

        assertThat(machine.view().credit()).isEqualByComparingTo("2.50");
    }

    @Test
    void rejectsAmountsThatAreNotCoins() {
        assertThatThrownBy(() -> machine.insertCoin(new BigDecimal("0.03")))
                .isInstanceOf(MachineException.class)
                .extracting(exception -> ((MachineException) exception).getCode())
                .isEqualTo(MachineError.INVALID_COIN);
        assertThat(machine.view().credit()).isEqualByComparingTo("0.00");
    }

    @Test
    @DisplayName("coins are matched by value, so 0.5 is the same coin as 0.50")
    void acceptsCoinsWrittenWithADifferentScale() {
        machine.insertCoin(new BigDecimal("0.5"));
        machine.insertCoin(new BigDecimal("1"));

        assertThat(machine.view().credit()).isEqualByComparingTo("1.50");
    }

    @Test
    void refillMergesDuplicateLinesInOneCall() {
        machine.refill(List.of(
                new CartLine(SHOWER_GEL, 2),
                new CartLine(SHOWER_GEL, 3)));

        assertThat(stock(SHOWER_GEL)).isEqualTo(8);
    }

    @Test
    void purchaseChargesTheTotalAndPaysBackTheRest() {
        machine.insertCoin(new BigDecimal("2.00"));

        PurchaseResult result = machine.purchase(List.of(new CartLine(SHOWER_GEL, 2)));

        assertThat(result.total()).isEqualByComparingTo("1.10");
        assertThat(result.change()).isEqualByComparingTo("0.90");
        assertThat(result.remainingCredit()).isEqualByComparingTo("0.00");
        assertThat(result.items()).singleElement().satisfies(item -> {
            assertThat(item.productId()).isEqualTo(SHOWER_GEL);
            assertThat(item.quantity()).isEqualTo(2);
            assertThat(item.lineTotal()).isEqualByComparingTo("1.10");
        });
        assertThat(stock(SHOWER_GEL)).isEqualTo(1);
        assertThat(machine.view().credit()).isEqualByComparingTo("0.00");
    }

    @Test
    void cannotBuyMoreUnitsThanTheSlotHolds() {
        machine.insertCoin(new BigDecimal("2.00"));

        assertThatThrownBy(() -> machine.purchase(List.of(new CartLine(SHOWER_GEL, 4))))
                .isInstanceOf(MachineException.class)
                .extracting(exception -> ((MachineException) exception).getCode())
                .isEqualTo(MachineError.INSUFFICIENT_STOCK);

        assertThat(stock(SHOWER_GEL)).isEqualTo(3);
        assertThat(machine.view().credit()).isEqualByComparingTo("2.00");
    }

    @Test
    void cannotBuyWithoutEnoughCredit() {
        machine.insertCoin(new BigDecimal("1.00"));

        assertThatThrownBy(() -> machine.purchase(List.of(new CartLine(NIGHT_CREAM, 1))))
                .isInstanceOf(MachineException.class)
                .extracting(exception -> ((MachineException) exception).getCode())
                .isEqualTo(MachineError.INSUFFICIENT_CREDIT);

        assertThat(stock(NIGHT_CREAM)).isEqualTo(3);
        assertThat(machine.view().credit()).isEqualByComparingTo("1.00");
    }

    @Test
    @DisplayName("a cart is sold completely or not at all")
    void failingCartDoesNotTouchAnySlot() {
        machine.insertCoin(new BigDecimal("2.00"));

        // shower gel is available, the night cream is far too expensive for the credit
        assertThatThrownBy(() -> machine.purchase(List.of(
                new CartLine(SHOWER_GEL, 1),
                new CartLine(NIGHT_CREAM, 1))))
                .isInstanceOf(MachineException.class);

        assertThat(stock(SHOWER_GEL)).isEqualTo(3);
        assertThat(stock(NIGHT_CREAM)).isEqualTo(3);
        assertThat(machine.view().totalRevenue()).isEqualByComparingTo("0.00");
    }

    @Test
    void mergesDuplicateCartLines() {
        machine.insertCoin(new BigDecimal("2.00"));

        PurchaseResult result = machine.purchase(List.of(
                new CartLine(SHOWER_GEL, 1),
                new CartLine(SHOWER_GEL, 1)));

        assertThat(result.items()).singleElement()
                .satisfies(item -> assertThat(item.quantity()).isEqualTo(2));
        assertThat(stock(SHOWER_GEL)).isEqualTo(1);
    }

    @Test
    void rejectsEmptyCartAndNonPositiveQuantities() {
        machine.insertCoin(new BigDecimal("2.00"));

        assertThatThrownBy(() -> machine.purchase(List.of()))
                .isInstanceOf(MachineException.class)
                .extracting(exception -> ((MachineException) exception).getCode())
                .isEqualTo(MachineError.INVALID_QUANTITY);
        assertThatThrownBy(() -> machine.purchase(List.of(new CartLine(SHOWER_GEL, 0))))
                .isInstanceOf(MachineException.class)
                .extracting(exception -> ((MachineException) exception).getCode())
                .isEqualTo(MachineError.INVALID_QUANTITY);
    }

    @Test
    void refillTopsUpSlotsUntilTheyAreFull() {
        machine.refill(List.of(new CartLine(SHOWER_GEL, 5)));

        assertThat(stock(SHOWER_GEL)).isEqualTo(8);

        assertThatThrownBy(() -> machine.refill(List.of(new CartLine(SHOWER_GEL, 5))))
                .isInstanceOf(MachineException.class)
                .extracting(exception -> ((MachineException) exception).getCode())
                .isEqualTo(MachineError.SLOT_CAPACITY_EXCEEDED);
        assertThat(stock(SHOWER_GEL)).isEqualTo(8);
    }

    @Test
    void refilledUnitsCanBeSoldAfterwards() {
        machine.refill(List.of(new CartLine(SHOWER_GEL, 7)));
        machine.insertCoin(new BigDecimal("2.00"));

        // 10 units in the slot now, so 3 of them fit into 1.65 EUR
        PurchaseResult result = machine.purchase(List.of(new CartLine(SHOWER_GEL, 3)));

        assertThat(result.total()).isEqualByComparingTo("1.65");
        assertThat(result.change()).isEqualByComparingTo("0.35");
        assertThat(stock(SHOWER_GEL)).isEqualTo(7);
    }

    @Test
    void refillOfUnknownProductIsRejected() {
        assertThatThrownBy(() -> machine.refill(List.of(new CartLine(99, 1))))
                .isInstanceOf(MachineException.class)
                .extracting(exception -> ((MachineException) exception).getCode())
                .isEqualTo(MachineError.UNKNOWN_PRODUCT);
    }

    @Test
    void returningCreditRefundsTheInsertedCoins() {
        machine.insertCoin(new BigDecimal("1.00"));
        machine.insertCoin(new BigDecimal("0.20"));

        assertThat(machine.returnCredit()).isEqualByComparingTo("1.20");
        assertThat(machine.view().credit()).isEqualByComparingTo("0.00");
        assertThat(machine.returnCredit()).isEqualByComparingTo("0.00");
    }

    @Test
    void tracksRevenueAndUnitsSoldForTheStaffView() {
        machine.insertCoin(new BigDecimal("2.00"));
        machine.purchase(List.of(new CartLine(SHOWER_GEL, 2)));
        machine.insertCoin(new BigDecimal("2.00"));
        machine.purchase(List.of(new CartLine(SHOWER_GEL, 1)));

        MachineView view = machine.view();

        assertThat(view.totalRevenue()).isEqualByComparingTo("1.65");
        assertThat(view.products())
                .filteredOn(product -> product.id() == SHOWER_GEL)
                .singleElement()
                .satisfies(product -> assertThat(product.unitsSold()).isEqualTo(3));
    }

    @Test
    @DisplayName("absurd quantities are rejected instead of overflowing stock or money")
    void rejectsQuantitiesAboveTheSlotCapacity() {
        machine.insertCoin(new BigDecimal("2.00"));

        assertThatThrownBy(() -> machine.purchase(List.of(new CartLine(SHOWER_GEL, 2_000_000_000))))
                .isInstanceOf(MachineException.class)
                .extracting(exception -> ((MachineException) exception).getCode())
                .isEqualTo(MachineError.INVALID_QUANTITY);

        // two huge lines used to overflow the merged quantity into a negative number
        assertThatThrownBy(() -> machine.purchase(List.of(
                new CartLine(SHOWER_GEL, 2_000_000_000),
                new CartLine(SHOWER_GEL, 2_000_000_000))))
                .isInstanceOf(MachineException.class)
                .extracting(exception -> ((MachineException) exception).getCode())
                .isEqualTo(MachineError.INVALID_QUANTITY);

        assertThat(stock(SHOWER_GEL)).isEqualTo(3);
        assertThat(machine.view().credit()).isEqualByComparingTo("2.00");
        assertThat(machine.view().totalRevenue()).isEqualByComparingTo("0.00");
    }

    @Test
    @DisplayName("parallel checkouts never oversell, and no cent is lost or created")
    void concurrentPurchasesNeverOversell() throws Exception {
        int attempts = 8;
        var ready = new CountDownLatch(attempts);
        var start = new CountDownLatch(1);
        var changes = new ConcurrentLinkedQueue<BigDecimal>();

        try (var pool = Executors.newFixedThreadPool(attempts)) {
            List<Future<Boolean>> results = IntStream.range(0, attempts)
                    .mapToObj(index -> pool.submit(() -> {
                        ready.countDown();
                        start.await();
                        machine.insertCoin(new BigDecimal("2.00"));
                        try {
                            changes.add(machine.purchase(List.of(new CartLine(SHOWER_GEL, 1))).change());
                            return true;
                        } catch (MachineException rejected) {
                            // losing the race means either no units or no credit left
                            assertThat(rejected.getCode()).isIn(
                                    MachineError.INSUFFICIENT_STOCK,
                                    MachineError.INSUFFICIENT_CREDIT);
                            return false;
                        }
                    }))
                    .toList();
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            long successes = 0;
            for (Future<Boolean> result : results) {
                if (result.get(5, TimeUnit.SECONDS)) {
                    successes++;
                }
            }
            assertThat(successes).isBetween(1L, 3L);
            long sold = successes;

            MachineView view = machine.view();
            // never more units sold than the slot held, and exactly the stock that is gone
            assertThat(stock(SHOWER_GEL)).isEqualTo((int) (3 - successes));
            assertThat(view.totalRevenue()).isEqualByComparingTo(
                    new BigDecimal("0.55").multiply(BigDecimal.valueOf(sold)));
            assertThat(view.products())
                    .filteredOn(product -> product.id() == SHOWER_GEL)
                    .singleElement()
                    .satisfies(product -> assertThat(product.unitsSold()).isEqualTo(sold));

            // money conservation: revenue + credit + returned change == inserted coins
            BigDecimal changeSum = changes.stream().reduce(new BigDecimal("0.00"), BigDecimal::add);
            assertThat(view.totalRevenue().add(view.credit()).add(changeSum))
                    .isEqualByComparingTo("16.00");
        }
    }

    private int stock(long productId) {
        return machine.view().products().stream()
                .filter(product -> product.id() == productId)
                .findFirst()
                .orElseThrow()
                .stock();
    }
}
