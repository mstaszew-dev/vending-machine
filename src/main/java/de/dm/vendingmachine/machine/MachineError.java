package de.dm.vendingmachine.machine;

/**
 * Business errors of the vending machine. The API layer maps each code to an HTTP status
 * so the domain stays free of web concerns.
 */
public enum MachineError {

    INVALID_COIN,
    INVALID_QUANTITY,
    UNKNOWN_PRODUCT,
    INSUFFICIENT_STOCK,
    INSUFFICIENT_CREDIT,
    SLOT_CAPACITY_EXCEEDED
}
