package de.dm.vendingmachine.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

/** Request body for {@code POST /api/machine/purchase} and {@code /refill}. */
public record PositionsRequest(@NotEmpty List<@Valid CartItemRequest> items) {
}
