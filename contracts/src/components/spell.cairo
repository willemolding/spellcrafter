use starknet::ContractAddress;

#[derive(Component, Copy, Drop, Serde, SerdeLen)]
struct Spell {
    #[key]
    entity_id: u128,

    barriers: u8,
    power: u32,
    chaos: u32,
    hot_cold: u32,
    light_dark: u32,
}
