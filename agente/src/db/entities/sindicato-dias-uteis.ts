import { Entity, PrimaryGeneratedColumn, Column, Index, Unique } from 'typeorm';

@Entity({ name: 'sindicatos_dias_uteis' })
@Unique('uq_sdu', ['competencia', 'sindicato'])
export class SindicatoDiasUteis {
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Index()
  @Column({ type: 'char', length: 7 })
  competencia!: string; // AAAA-MM

  @Column({ type: 'varchar', length: 256 })
  sindicato!: string;

  @Column({ type: 'int' })
  dias_uteis!: number;
}