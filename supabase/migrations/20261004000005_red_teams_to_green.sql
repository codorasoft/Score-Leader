-- Existing red teams become green (the new value must be committed before it can be used, hence a separate migration).
UPDATE public.teams SET color = 'green' WHERE color = 'red';
