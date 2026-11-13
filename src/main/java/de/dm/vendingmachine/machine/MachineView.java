package de.dm.vendingmachine.machine;

import java.math.BigDecimal;
import java.util.List;

/**
 * Complete state of the machine at one point in time. The frontend renders the whole
 * screen from this single document, so a purchase, coin insert or refill response is
 * always enough to refresh the UI without extra requests.
 */
public record MachineView(
        BigDecimal credit,
        List<ProductView> products,
        List<BigDecimal> acceptedCoins,
        BigDecimal totalRevenue) {
}
