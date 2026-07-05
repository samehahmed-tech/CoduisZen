import { useState, useCallback } from 'react';

type FormErrors<T> = Partial<Record<keyof T, string>>;
type Validators<T> = Partial<Record<keyof T, (value: any, values: T) => string | undefined>>;

interface UseFormReturn<T> {
    values: T;
    errors: FormErrors<T>;
    touched: Partial<Record<keyof T, boolean>>;
    setValue: <K extends keyof T>(field: K, value: T[K]) => void;
    setValues: (partial: Partial<T>) => void;
    setError: (field: keyof T, error: string) => void;
    touch: (field: keyof T) => void;
    validate: () => boolean;
    reset: () => void;
    isValid: boolean;
    isDirty: boolean;
}

/**
 * Lightweight form state management hook.
 *
 * Usage:
 *   const { values, errors, setValue, touch, validate } = useForm(
 *     { name: '', email: '', qty: 1 },
 *     { name: v => !v ? 'Required' : undefined, email: v => !v.includes('@') ? 'Invalid' : undefined }
 *   );
 *
 *   <InputField label="Name" value={values.name} onChange={v => setValue('name', v)}
 *     onBlur={() => touch('name')} error={touched.name ? errors.name : undefined} />
 */
export function useForm<T extends Record<string, any>>(
    initialValues: T,
    validators?: Validators<T>
): UseFormReturn<T> {
    const [values, setValuesState] = useState<T>(initialValues);
    const [errors, setErrors] = useState<FormErrors<T>>({});
    const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
    const [isDirty, setIsDirty] = useState(false);

    const setValue = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
        setValuesState(prev => {
            const next = { ...prev, [field]: value };
            // Run field validator
            if (validators?.[field]) {
                const err = validators[field]!(value, next);
                setErrors(prev => ({ ...prev, [field]: err }));
            }
            return next;
        });
        setIsDirty(true);
    }, [validators]);

    const setValues = useCallback((partial: Partial<T>) => {
        setValuesState(prev => ({ ...prev, ...partial }));
        setIsDirty(true);
    }, []);

    const setError = useCallback((field: keyof T, error: string) => {
        setErrors(prev => ({ ...prev, [field]: error }));
    }, []);

    const touch = useCallback((field: keyof T) => {
        setTouched(prev => ({ ...prev, [field]: true }));
        // Validate on touch
        if (validators?.[field]) {
            const err = validators[field]!(values[field], values);
            setErrors(prev => ({ ...prev, [field]: err }));
        }
    }, [validators, values]);

    const validate = useCallback((): boolean => {
        if (!validators) return true;
        const newErrors: FormErrors<T> = {};
        let valid = true;
        const allTouched: Partial<Record<keyof T, boolean>> = {};
        for (const key of Object.keys(validators) as Array<keyof T>) {
            allTouched[key] = true;
            const err = validators[key]!(values[key], values);
            if (err) { newErrors[key] = err; valid = false; }
        }
        setErrors(newErrors);
        setTouched(prev => ({ ...prev, ...allTouched }));
        return valid;
    }, [validators, values]);

    const reset = useCallback(() => {
        setValuesState(initialValues);
        setErrors({});
        setTouched({});
        setIsDirty(false);
    }, [initialValues]);

    const isValid = Object.values(errors).every(e => !e);

    return { values, errors, touched, setValue, setValues, setError, touch, validate, reset, isValid, isDirty };
}

export default useForm;
