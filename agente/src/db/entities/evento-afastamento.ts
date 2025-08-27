// arquivo: src/db/entities/evento-afastamento.ts
import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity({ name: 'eventos_afastamentos' })
export class EventoAfastamento {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Index()
  @Column({ type: 'char', length: 7 })
  competencia!: string; // AAAA-MM

  @Index()
  @Column({ type: 'varchar', length: 32 })
  matricula!: string;

  @Column({ type: 'varchar', length: 128 })
  tipo_afastamento!: string;

  @Column({ type: 'tinyint', width: 1, default: 1 })
  excluir_da_compra!: boolean;
}