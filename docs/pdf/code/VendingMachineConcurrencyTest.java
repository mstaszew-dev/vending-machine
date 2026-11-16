package de.dm.vendingmachine.machine;

// Excerpt from src/test/java/de/dm/vendingmachine/machine/VendingMachineTest.java.
// Omitted: static AssertJ imports, the machine fixture (a VendingMachine with the
// eight catalog products, slot capacity 10, initial stock 3), the 17 other tests
// and the stock(long productId) helper used below.

import de.dm.vendingmachine.catalog.ProductCatalog;
import java.math.BigDecimal;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class VendingMachineTestExcerpt {

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
}
