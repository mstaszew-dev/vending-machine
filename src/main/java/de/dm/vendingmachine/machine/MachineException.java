package de.dm.vendingmachine.machine;

/**
 * Thrown whenever a customer or staff action would violate a machine rule, for example
 * buying more units than the slot holds. Carries a stable {@link MachineError} code that
 * clients can react to without parsing the message.
 */
public class MachineException extends RuntimeException {

    private final MachineError code;

    public MachineException(MachineError code, String message) {
        super(message);
        this.code = code;
    }

    public MachineError getCode() {
        return code;
    }
}
